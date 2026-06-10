/**
 * @module server/api/config.post
 *
 * Endpoint POST /api/config — Écriture partielle de la configuration.
 *
 * Accepte un payload JSON partiel et ne met à jour QUE les clés présentes dans le body.
 * Les clés absentes (undefined) sont ignorées, ce qui permet des mises à jour atomiques
 * sans écraser les autres parties de la configuration.
 *
 * ## Payload (toutes les clés sont optionnelles)
 *
 * ```json
 * {
 *   "services":   [...],   // Met à jour uniquement les services
 *   "composites": [...],   // Met à jour uniquement les composites
 *   "order":      [...],   // Met à jour uniquement l'ordre
 *   "levels":     [...]    // Met à jour uniquement les niveaux
 * }
 * ```
 *
 * ## Usage côté client
 *
 * useServerConfig appelle cet endpoint avec des payloads partiels :
 * - `save('services')`   → body = `{ services: [...], composites: undefined, ... }`
 * - `save('composites')` → body = `{ services: undefined, composites: [...], ... }`
 *
 * Cela évite les conflits si deux onglets modifient des parties différentes
 * en même temps (les modifications sont indépendantes).
 *
 * ## Retour
 *
 * Retourne toujours `{ ok: true }` en cas de succès.
 * Nitro lève automatiquement une erreur 500 si le storage est inaccessible.
 */

import { defineEventHandler, readBody } from 'h3'
import { poller } from '../lib/pollerState'

interface ConfigBody {
  services?: unknown[]
  composites?: unknown[]
  order?: string[]
  levels?: unknown[]
  theme?: string
  pageStyle?: string
  accessControl?: unknown
}

export default defineEventHandler(async (event) => {
  const body = await readBody<ConfigBody>(event)
  const storage = useStorage('config')

  // Mise à jour partielle : seules les clés présentes dans le payload sont écrites
  if (body.services !== undefined)      await storage.setItem('services',      body.services)
  if (body.composites !== undefined)    await storage.setItem('composites',    body.composites)
  if (body.order !== undefined)         await storage.setItem('order',         body.order)
  if (body.levels !== undefined)        await storage.setItem('levels',        body.levels)
  if (body.theme !== undefined)         await storage.setItem('theme',         body.theme)
  if (body.pageStyle !== undefined)     await storage.setItem('pageStyle',     body.pageStyle)
  if (body.accessControl !== undefined) await storage.setItem('accessControl', body.accessControl)

  if (body.services !== undefined || body.composites !== undefined) {
    await poller.reload()
  }

  // Broadcaster la config mise à jour à tous les clients WS
  // et recharger le scheduler immédiatement si services/composites changent
  const configChanged = body.services !== undefined || body.composites !== undefined || body.order !== undefined
  if (configChanged) {
    // Recharger le scheduler (nouveaux services, suppressions, toggles)
    import('../plugins/scheduler').then(({ reloadSchedulers }) => reloadSchedulers()).catch(() => {})

    // Lire la config complète et la broadcaster
    const full = {
      services:   await storage.getItem('services')   ?? [],
      composites: await storage.getItem('composites') ?? [],
      order:      await storage.getItem('order')      ?? [],
    }
    import('../routes/_ws').then(({ broadcast }) => {
      broadcast({ type: 'config', data: full })
    }).catch(() => {})
  }

  return { ok: true }
})
