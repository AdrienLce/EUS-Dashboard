/**
 * Connexion WebSocket côté client.
 * Reçoit les snapshots du serveur et les pousse dans useStatusStore.
 * Remplace usePolling + useScheduler (qui tournaient dans le navigateur).
 */

import { useStatusStore } from './useStatusStore'
import { useServerConfig } from './useServerConfig'
import type { StatusSnapshot, ServiceConfig, CompositeServiceConfig } from '~/types'

let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
const connected = ref(false)

function connect() {
  if (!import.meta.client) return
  if (ws?.readyState === WebSocket.OPEN) return

  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  ws = new WebSocket(`${proto}//${window.location.host}/_ws`)

  ws.onopen = () => {
    connected.value = true
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  }

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data)

      if (msg.type === 'snapshot') {
        const { pushSnapshot } = useStatusStore()
        pushSnapshot(msg.data as StatusSnapshot)
      }

      // Mise à jour config temps réel : service ajouté/supprimé/désactivé
      if (msg.type === 'config' && msg.data) {
        const { services, composites, order } = useServerConfig()
        if (msg.data.services !== undefined)
          services.value = msg.data.services as ServiceConfig[]
        if (msg.data.composites !== undefined)
          composites.value = msg.data.composites as CompositeServiceConfig[]
        if (msg.data.order !== undefined)
          order.value = msg.data.order as string[]
      }
    }
    catch { /* message invalide */ }
  }

  ws.onclose = () => {
    connected.value = false
    ws = null
    // Reconnexion automatique après 3s
    reconnectTimer = setTimeout(connect, 3000)
  }

  ws.onerror = () => {
    ws?.close()
  }
}

/** Demande un refresh immédiat d'un service au serveur */
function requestRefresh(serviceId: string) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'refresh', serviceId }))
  }
}

function disconnect() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  ws?.close()
  ws = null
}

export function useRealtimeStatus() {
  return { connect, disconnect, requestRefresh, connected }
}
