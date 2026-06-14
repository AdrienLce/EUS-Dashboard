import type { StatusSnapshot } from '~/types'

interface Peer {
  send: (data: string) => void
}

/** Last known snapshot per serviceId — sent to new WS clients on connection */
export const statusMap = new Map<string, StatusSnapshot>()

/** Active WebSocket connections */
export const peers = new Set<Peer>()

/** Immediate-refresh functions per serviceId — called from the WS handler */
export const refreshFns = new Map<string, () => Promise<void>>()

/** Mutable reference to the poller's reload function — initialized by server/plugins/poller.ts */
export const poller = {
  reload: async () => {},
}

export function broadcast(data: unknown): void {
  const msg = JSON.stringify(data)
  for (const peer of peers) {
    try {
      peer.send(msg)
    } catch {
      peers.delete(peer)
    }
  }
}
