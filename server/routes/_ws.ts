/**
 * WebSocket handler — diffuse les snapshots à tous les clients connectés.
 * URL : ws://host/_ws
 *
 * Messages envoyés par le serveur :
 *   { type: 'snapshot', data: StatusSnapshot }
 *   { type: 'error', serviceId, message }
 *   { type: 'connected', message }
 *
 * Messages reçus du client :
 *   { type: 'refresh', serviceId }  → force un re-poll immédiat
 */

import { defineWebSocketHandler } from 'h3'

// Ensemble des peers connectés (une entrée par onglet/navigateur)
export const peers = new Set<{ send: (data: string) => void }>()

/** Envoie un message à tous les clients connectés */
export function broadcast(payload: unknown) {
  const msg = typeof payload === 'string' ? payload : JSON.stringify(payload)
  for (const peer of peers) {
    try { peer.send(msg) } catch { /* peer déconnecté */ }
  }
}

export default defineWebSocketHandler({
  open(peer) {
    peers.add(peer)
    peer.send(JSON.stringify({ type: 'connected', message: `${peers.size} client(s) connecté(s)` }))

    // Config actuelle + snapshots connus → état immédiat pour le nouveau client
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
        // Le client demande un refresh immédiat → émis vers le scheduler
        import('../plugins/scheduler').then(({ triggerRefresh }) => {
          triggerRefresh(msg.serviceId)
        }).catch(() => {})
      }
    }
    catch { /* message invalide */ }
  },
})
