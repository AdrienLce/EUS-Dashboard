/**
 * Client-side WebSocket connection.
 * Receives snapshots from the server and pushes them into useStatusStore.
 * Replaces usePolling + useScheduler (which used to run in the browser).
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

      // Real-time config update: service added/removed/disabled
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
    catch { /* invalid message */ }
  }

  ws.onclose = () => {
    connected.value = false
    ws = null
    // Automatic reconnection after 3s
    reconnectTimer = setTimeout(connect, 3000)
  }

  ws.onerror = () => {
    ws?.close()
  }
}

/** Requests an immediate refresh of a service from the server */
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
