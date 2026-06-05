import { ref } from 'vue'
import type { ServiceConfig, SubServiceConfig, CompositeServiceConfig } from '~/types'
import { runAdapter } from '~/adapters/index'
import { buildPreDetectionUrl, parsePreDetection } from '~/adapters/predetection'
import { useStatusStore } from './useStatusStore'
import { useScheduler } from './useScheduler'

const loading = ref<Record<string, boolean>>({})
const errors = ref<Record<string, string | null>>({})

async function checkPreDetection(
  snap: import('~/types').StatusSnapshot,
  pd: import('~/types').PreDetectionConfig | undefined,
) {
  if (!pd?.enabled || !pd.target || snap.level !== 'operational') return
  try {
    const fetchUrl = buildPreDetectionUrl(pd)
    if (!fetchUrl) return

    const headers: Record<string, string> = pd.source === 'reddit'
      ? { 'User-Agent': 'status-dashboard/1.0' }
      : pd.source === 'downdetector'
        ? {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
            'Accept-Language': 'fr-FR,fr;q=0.9',
            'Referer': 'https://www.google.com/',
          }
        : {}

    const data = await $fetch('/api/proxy', {
      method: 'POST',
      body: { url: fetchUrl, method: 'GET', headers },
    })

    const result = parsePreDetection(pd.source, data, pd)
    if (result?.triggered) {
      snap.preDetected = true
      snap.preDetectedCount = result.count
    }
  }
  catch { /* silencieux — best-effort */ }
}

async function fetchOne(
  id: string,
  url: string,
  method: string,
  headers: Record<string, string>,
  body: string | undefined,
  adapter: string,
  customMapping: ServiceConfig['customMapping'],
  preDetection?: import('~/types').PreDetectionConfig,
) {
  loading.value[id] = true
  errors.value[id] = null

  try {
    const data = await $fetch('/api/proxy', { method: 'POST', body: { url, method, headers, body } })
    const result = runAdapter(adapter, data, customMapping)
    const { pushSnapshot } = useStatusStore()
    const snap: import('~/types').StatusSnapshot = {
      serviceId: id,
      timestamp: new Date().toISOString(),
      level: result.level,
      message: result.message,
      incidents: result.incidents,
    }
    if (result.entries) snap.entries = result.entries
    await checkPreDetection(snap, preDetection)
    pushSnapshot(snap)
  }
  catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erreur de récupération'
    errors.value[id] = msg
    const statusCode = (err as { statusCode?: number })?.statusCode ?? 0
    const isAuthError = statusCode === 401 || statusCode === 403 || msg.includes('401') || msg.includes('403')
    const { pushSnapshot } = useStatusStore()
    pushSnapshot({
      serviceId: id,
      timestamp: new Date().toISOString(),
      level: isAuthError ? 'inconnu' : 'majeur',
      message: isAuthError ? 'Accès refusé — authentification ou configuration requise' : `Erreur: ${msg}`,
      incidents: [],
    })
  }
  finally {
    loading.value[id] = false
  }
}

function makeFetchFn(svc: ServiceConfig | SubServiceConfig) {
  const pd = 'preDetection' in svc ? (svc as ServiceConfig).preDetection : undefined
  return () => fetchOne(svc.id, svc.url, svc.method, svc.headers, svc.body, svc.adapter, svc.customMapping, pd)
}

export function usePolling() {
  const { schedule, unschedule, unschedulePrefix } = useScheduler()

  function startPolling(service: ServiceConfig) {
    const ms = Math.min(service.pollInterval, 120) * 1000
    schedule(service.id, ms, makeFetchFn(service))
  }

  function stopPolling(serviceId: string) {
    unschedule(serviceId)
  }

  function startCompositePolling(composite: CompositeServiceConfig) {
    stopCompositePolling(composite.id)
    const ms = Math.min(composite.pollInterval, 120) * 1000
    for (const child of composite.children) {
      if (!child.enabled) continue
      schedule(`${composite.id}::${child.id}`, ms, makeFetchFn(child))
    }
  }

  function stopCompositePolling(compositeId: string) {
    unschedulePrefix(`${compositeId}::`)
  }

  function stopAll() {
    unschedulePrefix('')
  }

  function refreshService(service: ServiceConfig) {
    fetchOne(service.id, service.url, service.method, service.headers, service.body, service.adapter, service.customMapping)
  }

  function refreshComposite(composite: CompositeServiceConfig) {
    for (const child of composite.children) {
      if (child.enabled) fetchOne(child.id, child.url, child.method, child.headers, child.body, child.adapter, child.customMapping)
    }
  }

  function refreshChild(child: SubServiceConfig) {
    fetchOne(child.id, child.url, child.method, child.headers, child.body, child.adapter, child.customMapping)
  }

  return {
    loading,
    errors,
    startPolling,
    stopPolling,
    stopAll,
    refreshService,
    startCompositePolling,
    stopCompositePolling,
    refreshComposite,
    refreshChild,
  }
}
