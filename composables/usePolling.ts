import { ref } from 'vue'
import type { ServiceConfig, SubServiceConfig, CompositeServiceConfig, StatusSnapshot } from '~/types'
import { useStatusStore } from './useStatusStore'

const loading = ref<Record<string, boolean>>({})
const errors = ref<Record<string, string | null>>({})

let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

function connect() {
  if (!import.meta.client) return

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  ws = new WebSocket(`${protocol}//${location.host}/api/ws`)

  ws.onopen = () => {
    errors.value['_ws'] = null
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  ws.onmessage = (event) => {
    const { pushSnapshot } = useStatusStore()
    try {
      const msg = JSON.parse(event.data as string) as
        | { type: 'init'; data: Record<string, StatusSnapshot> }
        | { type: 'snapshot'; data: StatusSnapshot }

      if (msg.type === 'init') {
        for (const snap of Object.values(msg.data)) {
          pushSnapshot(snap)
          loading.value[snap.serviceId] = false
        }
      }
      else if (msg.type === 'snapshot') {
        pushSnapshot(msg.data)
        loading.value[msg.data.serviceId] = false
      }
    }
    catch { /* message malformé, ignoré */ }
  }

  ws.onerror = () => {
    errors.value['_ws'] = 'Connexion WebSocket perdue'
  }

  ws.onclose = () => {
    ws = null
    reconnectTimer = setTimeout(connect, 3_000)
  }
}

function sendRefresh(serviceId: string) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'refresh', serviceId }))
    loading.value[serviceId] = true
  }
}

export function usePolling() {
  if (import.meta.client && !ws && !reconnectTimer) connect()

  function refreshService(service: ServiceConfig) {
    sendRefresh(service.id)
  }

  function refreshComposite(composite: CompositeServiceConfig) {
    for (const child of composite.children) {
      if (child.enabled) sendRefresh(child.id)
    }
  }

  function refreshChild(child: SubServiceConfig) {
    sendRefresh(child.id)
  }

  // Conservés pour compatibilité API — le polling est maintenant géré côté serveur
  function startPolling(_service?: ServiceConfig) {}
  function stopPolling(_serviceId?: string) {}
  function startCompositePolling(_composite?: CompositeServiceConfig) {}
  function stopCompositePolling(_compositeId?: string) {}
  function stopAll() {}

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
