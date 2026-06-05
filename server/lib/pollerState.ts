import type { StatusSnapshot } from '~/types'

interface Peer {
  send: (data: string) => void
}

/** Dernier snapshot connu par serviceId — envoyé aux nouveaux clients WS à la connexion */
export const statusMap = new Map<string, StatusSnapshot>()

/** Connexions WebSocket actives */
export const peers = new Set<Peer>()

/** Fonctions de rafraîchissement immédiat par serviceId — appelées depuis le handler WS */
export const refreshFns = new Map<string, () => Promise<void>>()

/** Référence mutable vers la fonction reload du poller — initialisée par server/plugins/poller.ts */
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
