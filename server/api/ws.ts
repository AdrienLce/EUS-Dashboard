import { statusMap, peers, refreshFns } from '../lib/pollerState'

export default defineWebSocketHandler({
  open(peer) {
    peers.add(peer)
    peer.send(JSON.stringify({ type: 'init', data: Object.fromEntries(statusMap) }))
  },

  async message(peer, message) {
    try {
      const msg = JSON.parse(message.text()) as { type: string; serviceId?: string }
      if (msg.type === 'refresh' && msg.serviceId) {
        const fn = refreshFns.get(msg.serviceId)
        if (fn) await fn()
      }
    }
    catch { /* malformed message, ignored */ }
  },

  close(peer) {
    peers.delete(peer)
  },

  error(peer) {
    peers.delete(peer)
  },
})
