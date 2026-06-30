/**
 * Nitro plugin — Server-side scheduler.
 *
 * Runs on the server side, independently of connected browsers.
 * Polls external APIs directly (not via /api/proxy),
 * then broadcasts snapshots to all WebSocket clients.
 *
 * Reloads the config every 30s to detect new services.
 */

import { fetch as httpFetch, type RequestInit as HttpRequestInit } from 'undici'
import { runAdapter } from '../../adapters/index'
import { broadcast } from '../routes/_ws'
import { assertPublicUrl } from '../lib/ssrf'
import type { ServiceConfig, SubServiceConfig, CompositeServiceConfig, StatusSnapshot } from '../../types/index'

// Map of active timers: serviceId → NodeJS.Timeout
const timers = new Map<string, ReturnType<typeof setInterval>>()

// Immediate-refresh callbacks registered per service
const refreshCallbacks = new Map<string, () => void>()

// Last known snapshot per service — sent to new clients on connection
export const lastSnapshots = new Map<string, StatusSnapshot>()

/** Called from the WS handler when the client requests a refresh */
export function triggerRefresh(serviceId: string) {
  const fn = refreshCallbacks.get(serviceId)
  if (fn) fn()
}

/** Direct fetch from the server (not via the internal HTTP proxy) */
async function serverFetch(url: string, method: string, headers: Record<string, string>, body?: string, isPing = false): Promise<unknown> {
  // SSRF guard: configs are user-supplied, so the live polling path must block
  // private/loopback/link-local targets (incl. cloud metadata) like /api/proxy does.
  assertPublicUrl(url)

  const options: HttpRequestInit = {
    method,
    headers: {
      // Browser-like headers: some status edges (Cloudflare/bot protection) reject
      // non-browser clients. Per-service headers can still override these.
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      ...headers,
    },
  }
  if (method === 'POST' && body) {
    options.body = body
    ;(options.headers as Record<string, string>)['Content-Type'] = 'application/json'
  }

  // For ping: capture the HTTP status code even on error
  if (isPing) {
    try {
      const res = await httpFetch(url, options)
      return { _statusCode: res.status, _ok: res.ok }
    } catch {
      return { _statusCode: 0, _ok: false }
    }
  }

  const res = await fetch(url, options)
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`)

  const contentType = res.headers.get('content-type') ?? ''
  return contentType.includes('application/json')
    ? await res.json()
    : { _raw: await res.text() }
}

/** Poll a service, run the adapter, broadcast the snapshot */
async function pollService(svc: ServiceConfig | SubServiceConfig) {
  try {
    const data = await serverFetch(svc.url, svc.method, svc.headers, svc.body, svc.adapter === 'ping')
    const result = runAdapter(svc.adapter, data, svc.customMapping, svc.rss)

    const snapshot: StatusSnapshot = {
      serviceId: svc.id,
      timestamp: new Date().toISOString(),
      level: result.level,
      message: result.message,
      incidents: result.incidents,
    }
    if (result.entries) snapshot.entries = result.entries

    lastSnapshots.set(svc.id, snapshot)
    broadcast({ type: 'snapshot', data: snapshot })
  }
  catch (err: unknown) {
    const e = err as Error & { statusCode?: number; cause?: { code?: string; message?: string } }
    const statusCode = e?.statusCode ?? 0
    const causeCode = e?.cause?.code || e?.cause?.message
    const msg = e?.message ?? 'Error'
    const probe = `${msg} ${causeCode ?? ''}`

    // Transport-level failure (DNS/TLS/timeout/reset/proxy): we couldn't reach the
    // STATUS SOURCE — that is not the same as the monitored service being down, so
    // show it as "unknown" (gray), not a red "major incident".
    const isTransport = msg.includes('fetch failed')
      || /ETIMEDOUT|ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|UND_ERR|ENETUNREACH|certificate|TLS|SSL/i.test(probe)
    const isAuth = statusCode === 401 || statusCode === 403 || msg.includes('401') || msg.includes('403')
    const isRate = statusCode === 429 || statusCode === 502 || statusCode === 503 || statusCode === 504 || msg.includes('429')

    let level: StatusSnapshot['level']
    let message: string
    if (isAuth) {
      level = 'inconnu'; message = 'Access denied — authentication required'
    }
    else if (isTransport) {
      level = 'inconnu'; message = `Status source unreachable${causeCode ? ` — ${causeCode}` : ''}`
    }
    else if (isRate) {
      level = 'inconnu'; message = `Request blocked (${statusCode || 'rate limit'})`
    }
    else {
      level = 'majeur'; message = `Error: ${msg}`
    }

    const errSnap: StatusSnapshot = {
      serviceId: svc.id,
      timestamp: new Date().toISOString(),
      level,
      message,
      incidents: [],
    }
    lastSnapshots.set(svc.id, errSnap)
    broadcast({ type: 'snapshot', data: errSnap })
  }
}

/** Starts polling a service */
function scheduleService(svc: ServiceConfig | SubServiceConfig, intervalMs: number) {
  const id = svc.id
  if (timers.has(id)) { clearInterval(timers.get(id)!); timers.delete(id) }

  // Immediate poll on startup
  pollService(svc)

  const timer = setInterval(() => pollService(svc), intervalMs)
  timers.set(id, timer)
  refreshCallbacks.set(id, () => pollService(svc))
}

/** Maps a timer key to the id used for snapshots / refresh callbacks.
 *  Composite children use the timer key `${compositeId}::${childId}` but are
 *  snapshotted and refreshed under the bare `childId` (what the client sends). */
function refreshKeyFor(timerKey: string): string {
  const sep = timerKey.indexOf('::')
  return sep === -1 ? timerKey : timerKey.slice(sep + 2)
}

/** Stops all timers of a composite */
function clearComposite(compositeId: string) {
  for (const [key] of timers) {
    if (key.startsWith(`${compositeId}::`)) {
      clearInterval(timers.get(key)!)
      timers.delete(key)
      refreshCallbacks.delete(refreshKeyFor(key))
    }
  }
}

/** Loads the config and (re)starts the required schedulers */
async function reloadSchedulers() {
  const storage = useStorage('config')
  const services = (await storage.getItem<ServiceConfig[]>('services')) ?? []
  const composites = (await storage.getItem<CompositeServiceConfig[]>('composites')) ?? []

  const activeIds = new Set<string>()

  // Simple services
  for (const svc of services) {
    if (!svc.enabled) continue
    const ms = Math.min(svc.pollInterval ?? 300, 1200) * 1000
    activeIds.add(svc.id)
    if (!timers.has(svc.id)) scheduleService(svc, ms)
  }

  // Composites → each child
  for (const composite of composites) {
    if (!composite.enabled) { clearComposite(composite.id); continue }
    const ms = Math.min(composite.pollInterval ?? 300, 1200) * 1000

    for (const child of composite.children) {
      if (!child.enabled) continue
      const key = `${composite.id}::${child.id}`
      activeIds.add(key)

      const effectiveAdapter = child.adapter && child.adapter !== 'auto'
        ? child.adapter
        : (composite.defaultAdapter ?? child.adapter)
      const effectiveMapping = child.customMapping ?? composite.defaultMapping

      const effectiveChild = { ...child, adapter: effectiveAdapter, customMapping: effectiveMapping }

      if (!timers.has(key)) {
        // Timer keyed by `${composite.id}::${child.id}` for grouping, but the
        // refresh callback is keyed by the bare child.id — that's the serviceId
        // the snapshot carries and the WS client sends in {type:'refresh'}.
        const timer = setInterval(() => pollService(effectiveChild), ms)
        pollService(effectiveChild)
        timers.set(key, timer)
        refreshCallbacks.set(child.id, () => pollService(effectiveChild))
      }
    }
  }

  // Clean up removed services
  for (const [key] of timers) {
    if (!activeIds.has(key)) {
      clearInterval(timers.get(key)!)
      timers.delete(key)
      refreshCallbacks.delete(refreshKeyFor(key))
    }
  }
}

/** Exposed so config.post.ts can trigger an immediate reload */
export { reloadSchedulers }

export default defineNitroPlugin(async () => {
  await reloadSchedulers()
  setInterval(reloadSchedulers, 30_000)
  console.info('[scheduler] Started — server-side polling active')
})
