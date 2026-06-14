/**
 * @module server/api/config.get
 *
 * GET /api/config endpoint — Reads the persisted configuration.
 *
 * Returns the full configuration from the Nitro fs storage:
 * - `services`   : list of simple services (ServiceConfig[])
 * - `composites` : list of composite services (CompositeServiceConfig[])
 * - `order`      : display order of services (string[] of IDs)
 * - `levels`     : status level configuration (LevelConfig[])
 *
 * ## Nitro storage
 *
 * The storage is configured in nuxt.config.ts with the `fs` driver, which persists
 * data in the Nitro application's `.data/` directory (outside the build).
 * The namespace key is `config:` (configured in nitro.storage).
 *
 * Each key (`services`, `composites`, `order`, `levels`) is a separate JSON file
 * in the storage directory.
 *
 * ## Returns empty arrays by default
 *
 * If a key does not yet exist in storage (first use), `getItem`
 * returns `null` — the `?? []` operator guarantees an empty array in all cases.
 */

import { defineEventHandler } from 'h3'

export default defineEventHandler(async () => {
  const storage = useStorage('config')
  const services      = await storage.getItem('services')      ?? []
  const composites    = await storage.getItem('composites')    ?? []
  const order         = await storage.getItem('order')         ?? []
  const levels        = await storage.getItem('levels')        ?? []
  const theme         = await storage.getItem('theme')         ?? 'light'
  const pageStyle     = await storage.getItem('pageStyle')     ?? 'box'
  const accessControl = await storage.getItem('accessControl') ?? null
  return { services, composites, order, levels, theme, pageStyle, accessControl }
})
