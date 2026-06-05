/**
 * @module server/api/config.get
 *
 * Endpoint GET /api/config — Lecture de la configuration persistée.
 *
 * Retourne la configuration complète depuis le Nitro fs storage :
 * - `services`   : liste des services simples (ServiceConfig[])
 * - `composites` : liste des services composites (CompositeServiceConfig[])
 * - `order`      : ordre d'affichage des services (string[] d'IDs)
 * - `levels`     : configuration des niveaux de statut (LevelConfig[])
 *
 * ## Storage Nitro
 *
 * Le storage est configuré dans nuxt.config.ts avec le driver `fs` qui persiste
 * les données dans le répertoire `.data/` de l'application Nitro (hors du build).
 * La clé de namespace est `config:` (configuré dans nitro.storage).
 *
 * Chaque clé (`services`, `composites`, `order`, `levels`) est un fichier JSON
 * distinct dans le répertoire de storage.
 *
 * ## Retourne des tableaux vides par défaut
 *
 * Si une clé n'existe pas encore dans le storage (première utilisation), `getItem`
 * retourne `null` — l'opérateur `?? []` garantit un tableau vide dans tous les cas.
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
