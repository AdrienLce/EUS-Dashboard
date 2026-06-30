/**
 * @module server/api/config.post
 *
 * POST /api/config endpoint — Partial write of the configuration.
 *
 * Accepts a partial JSON payload and updates ONLY the keys present in the body.
 * Missing keys (undefined) are ignored, which allows atomic updates
 * without overwriting the other parts of the configuration.
 *
 * ## Payload (all keys are optional)
 *
 * ```json
 * {
 *   "services":   [...],   // Updates services only
 *   "composites": [...],   // Updates composites only
 *   "order":      [...],   // Updates the order only
 *   "levels":     [...]    // Updates the levels only
 * }
 * ```
 *
 * ## Client-side usage
 *
 * useServerConfig calls this endpoint with partial payloads:
 * - `save('services')`   → body = `{ services: [...], composites: undefined, ... }`
 * - `save('composites')` → body = `{ services: undefined, composites: [...], ... }`
 *
 * This avoids conflicts when two tabs modify different parts
 * at the same time (the changes are independent).
 *
 * ## Return value
 *
 * Always returns `{ ok: true }` on success.
 * Nitro automatically throws a 500 error if the storage is inaccessible.
 */

import { defineEventHandler, readBody } from 'h3'

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

  // Partial update: only the keys present in the payload are written
  if (body.services !== undefined)      await storage.setItem('services',      body.services)
  if (body.composites !== undefined)    await storage.setItem('composites',    body.composites)
  if (body.order !== undefined)         await storage.setItem('order',         body.order)
  if (body.levels !== undefined)        await storage.setItem('levels',        body.levels)
  if (body.theme !== undefined)         await storage.setItem('theme',         body.theme)
  if (body.pageStyle !== undefined)     await storage.setItem('pageStyle',     body.pageStyle)
  if (body.accessControl !== undefined) await storage.setItem('accessControl', body.accessControl)

  // Broadcast the updated config to all WS clients
  // and reload the scheduler immediately if services/composites change
  const configChanged = body.services !== undefined || body.composites !== undefined || body.order !== undefined
  if (configChanged) {
    // Reload the scheduler (new services, deletions, toggles)
    import('../plugins/scheduler').then(({ reloadSchedulers }) => reloadSchedulers()).catch(() => {})

    // Read the full config and broadcast it
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
