import { fetch as httpFetch, type RequestInit as HttpRequestInit } from 'undici'
import { runAdapter } from '~/adapters/index'
import type { ServiceConfig, CompositeServiceConfig, StatusSnapshot } from '~/types'
import { statusMap, broadcast, refreshFns, poller } from '../lib/pollerState'

const TICK_MS = 5_000
const SSRF_BLOCKED = new Set(['localhost', '127.0.0.1', '0.0.0.0'])

interface PollerTask {
  intervalMs: number
  nextDue: number
  fn: () => Promise<void>
}

const tasks = new Map<string, PollerTask>()
let masterTimer: ReturnType<typeof setInterval> | null = null

function tick() {
  const now = Date.now()
  for (const [, task] of tasks) {
    if (now >= task.nextDue) {
      task.nextDue = now + task.intervalMs
      task.fn().catch(() => {})
    }
  }
}

function startMaster() {
  if (masterTimer !== null) return
  masterTimer = setInterval(tick, TICK_MS)
}

function stopMaster() {
  if (masterTimer === null) return
  clearInterval(masterTimer)
  masterTimer = null
}

function addTask(id: string, intervalMs: number, fn: () => Promise<void>) {
  fn().catch(() => {})
  tasks.set(id, { intervalMs, nextDue: Date.now() + intervalMs, fn })
  startMaster()
}

function clearAllTasks() {
  tasks.clear()
  refreshFns.clear()
  stopMaster()
}

async function serverFetch(url: string, method: string, headers: Record<string, string>, body?: string): Promise<unknown> {
  const u = new URL(url)
  const h = u.hostname
  if (SSRF_BLOCKED.has(h) || h.startsWith('192.168.') || h.startsWith('10.')) {
    throw Object.assign(new Error('Private network access forbidden'), { statusCode: 403 })
  }

  const opts: HttpRequestInit = {
    method,
    headers: {
      // Browser-like headers: some status edges (Cloudflare/bot protection) reject
      // non-browser clients. Per-service headers can still override these.
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      ...headers,
    },
  }
  if (method === 'POST' && body) {
    opts.body = body
    ;(opts.headers as Record<string, string>)['Content-Type'] = 'application/json'
  }

  const res = await httpFetch(url, opts)
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { statusCode: res.status })

  const ct = res.headers.get('content-type') ?? ''
  return ct.includes('application/json') ? await res.json() : { _raw: await res.text() }
}

async function pollOne(
  id: string,
  url: string,
  method: string,
  headers: Record<string, string>,
  body: string | undefined,
  adapter: string,
  customMapping: ServiceConfig['customMapping'],
): Promise<void> {
  let snap: StatusSnapshot
  try {
    const data = await serverFetch(url, method, headers, body)
    const result = runAdapter(adapter, data, customMapping)
    snap = {
      serviceId: id,
      timestamp: new Date().toISOString(),
      level: result.level,
      message: result.message,
      incidents: result.incidents,
    }
    if (result.entries) snap.entries = result.entries
  }
  catch (err: unknown) {
    const e = err as Error & { statusCode?: number; cause?: { code?: string; message?: string } }
    const code = e?.statusCode ?? 0
    const causeCode = e?.cause?.code || e?.cause?.message
    const msg = e instanceof Error ? e.message : 'Error'
    const probe = `${msg} ${causeCode ?? ''}`

    // Transport-level failure: we couldn't reach the status source — show "unknown"
    // (gray), not a red "major incident" (which would falsely imply the service is down).
    const isTransport = msg.includes('fetch failed')
      || /ETIMEDOUT|ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|UND_ERR|ENETUNREACH|certificate|TLS|SSL/i.test(probe)
    const isAuth = code === 401 || code === 403
    const isRate = code === 429 || code === 502 || code === 503 || code === 504

    let level: StatusSnapshot['level']
    let message: string
    if (isAuth) {
      level = 'inconnu'; message = 'Access denied — authentication required'
    }
    else if (isTransport) {
      level = 'inconnu'; message = `Status source unreachable${causeCode ? ` — ${causeCode}` : ''}`
    }
    else if (isRate) {
      level = 'inconnu'; message = `Request blocked (${code || 'rate limit'})`
    }
    else {
      level = 'majeur'; message = `Error: ${msg}`
    }
    snap = { serviceId: id, timestamp: new Date().toISOString(), level, message, incidents: [] }
  }

  statusMap.set(id, snap)
  broadcast({ type: 'snapshot', data: snap })
}

async function reload(): Promise<void> {
  clearAllTasks()

  const storage = useStorage('config')
  const [rawServices, rawComposites] = await Promise.all([
    storage.getItem<ServiceConfig[]>('services'),
    storage.getItem<CompositeServiceConfig[]>('composites'),
  ])
  const services: ServiceConfig[] = rawServices ?? []
  const composites: CompositeServiceConfig[] = rawComposites ?? []

  for (const svc of services) {
    if (!svc.enabled) continue
    const ms = Math.min(svc.pollInterval, 1200) * 1000
    const fn = () => pollOne(svc.id, svc.url, svc.method, svc.headers, svc.body, svc.adapter, svc.customMapping)
    addTask(svc.id, ms, fn)
    refreshFns.set(svc.id, fn)
  }

  for (const composite of composites) {
    if (!composite.enabled) continue
    const ms = Math.min(composite.pollInterval, 1200) * 1000

    for (const child of composite.children) {
      if (!child.enabled) continue
      const effectiveAdapter = child.adapter && child.adapter !== 'auto'
        ? child.adapter
        : (composite.defaultAdapter ?? child.adapter)
      const effectiveMapping = child.customMapping ?? composite.defaultMapping
      const fn = () => pollOne(child.id, child.url, child.method, child.headers, child.body, effectiveAdapter, effectiveMapping)
      addTask(`${composite.id}::${child.id}`, ms, fn)
      refreshFns.set(child.id, fn)
    }
  }
}

export default defineNitroPlugin(async () => {
  poller.reload = reload
  await reload()
})
