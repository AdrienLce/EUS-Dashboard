/**
 * WebSocket handler — broadcasts snapshots to all connected clients.
 * URL: ws://host/_ws
 *
 * Messages sent by the server:
 *   { type: 'snapshot', data: StatusSnapshot }
 *   { type: 'error', serviceId, message }
 *   { type: 'connected', message }
 *
 * Messages received from the client:
 *   { type: 'refresh', serviceId }  → forces an immediate re-poll
 */

import { defineWebSocketHandler } from 'h3'

// Set of connected peers (one entry per tab/browser)
export const peers = new Set<{ send: (data: string) => void }>()

/** Sends a message to all connected clients */
export function broadcast(payload: unknown) {
  const msg = typeof payload === 'string' ? payload : JSON.stringify(payload)
  for (const peer of peers) {
    try { peer.send(msg) } catch { /* peer disconnected */ }
  }
}

export default defineWebSocketHandler({
  open(peer) {
    peers.add(peer)
    peer.send(JSON.stringify({ type: 'connected', message: `${peers.size} client(s) connected` }))

    // Current config + known snapshots → immediate state for the new client
    Promise.all([
      import('../plugins/scheduler').then(({ lastSnapshots }) => {
        for (const snapshot of lastSnapshots.values()) {
          peer.send(JSON.stringify({ type: 'snapshot', data: snapshot }))
        }
      }),
      (async () => {
        const storage = useStorage('config')
        const full = {
          services:   await storage.getItem('services')   ?? [],
          composites: await storage.getItem('composites') ?? [],
          order:      await storage.getItem('order')      ?? [],
        }
        peer.send(JSON.stringify({ type: 'config', data: full }))
      })(),
    ]).catch(() => {})
  },

  close(peer) {
    peers.delete(peer)
  },

  message(peer, message) {
    try {
      const msg = JSON.parse(message.text())
      if (msg.type === 'refresh' && msg.serviceId) {
        // The client requests an immediate refresh → forwarded to the scheduler
        import('../plugins/scheduler').then(({ triggerRefresh }) => {
          triggerRefresh(msg.serviceId)
        }).catch(() => {})
      }
    }
    catch { /* invalid message */ }
  },
})
