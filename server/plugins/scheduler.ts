/**
 * Nitro plugin — Server-side scheduler.
 *
 * Runs on the server side, independently of connected browsers.
 * Polls external APIs directly (not via /api/proxy),
 * then broadcasts snapshots to all WebSocket clients.
 *
 * Reloads the config every 30s to detect new services.
 */

import { runAdapter } from '../../adapters/index'
import { broadcast } from '../routes/_ws'
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
  const options: RequestInit = {
    method,
    headers: {
      Accept: 'application/json',
      'User-Agent': 'StatusDashboard-Server/1.0',
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
      const res = await fetch(url, options)
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
    const result = runAdapter(svc.adapter, data, svc.customMapping)

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
    const msg = (err as Error).message ?? 'Erreur'
    const statusCode = (err as { statusCode?: number })?.statusCode ?? 0
    const isProxy = statusCode === 429 || statusCode === 502 || statusCode === 503
      || msg.includes('429') || msg.includes('ECONNREFUSED')
    const isAuth = statusCode === 401 || statusCode === 403

    const errSnap: StatusSnapshot = {
      serviceId: svc.id,
      timestamp: new Date().toISOString(),
      level: (isAuth || isProxy) ? 'inconnu' : 'majeur',
      message: isAuth
        ? 'Accès refusé — authentification requise'
        : isProxy
          ? `Requête bloquée (${statusCode || 'réseau'})`
          : `Erreur: ${msg}`,
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

/** Stops all timers of a composite */
function clearComposite(compositeId: string) {
  for (const [key] of timers) {
    if (key.startsWith(`${compositeId}::`)) {
      clearInterval(timers.get(key)!)
      timers.delete(key)
      refreshCallbacks.delete(key)
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
        // Composite key for grouping
        const timer = setInterval(() => pollService(effectiveChild), ms)
        pollService(effectiveChild)
        timers.set(key, timer)
        refreshCallbacks.set(key, () => pollService(effectiveChild))
      }
    }
  }

  // Clean up removed services
  for (const [key] of timers) {
    if (!activeIds.has(key)) {
      clearInterval(timers.get(key)!)
      timers.delete(key)
      refreshCallbacks.delete(key)
    }
  }
}

/** Exposed so config.post.ts can trigger an immediate reload */
export { reloadSchedulers }

export default defineNitroPlugin(async () => {
  await reloadSchedulers()
  setInterval(reloadSchedulers, 30_000)
  console.info('[scheduler] Démarré — polling côté serveur actif')
})
