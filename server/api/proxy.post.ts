/**
 * @module server/api/proxy.post
 *
 * Proxy HTTP côté serveur avec cache en mémoire.
 *
 * ## Cache
 *
 * Chaque réponse GET est mise en cache en mémoire pendant `cacheTtl` secondes
 * (défaut : 120s). Les requêtes vers la même URL pendant cette fenêtre retournent
 * la réponse cachée sans rappeler le service externe.
 *
 * Cela évite les erreurs 429 (Too Many Requests) sur les services qui rate-limitent
 * les appels répétés depuis la même IP serveur.
 *
 * Le client peut forcer un rafraîchissement en passant `{ forceRefresh: true }`.
 */

import { defineEventHandler, readBody, createError } from 'h3'

interface ProxyRequest {
  url: string
  method: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: string
  /** TTL du cache en secondes (défaut: 120). 0 = pas de cache. */
  cacheTtl?: number
  /** Ignore le cache et force un nouvel appel */
  forceRefresh?: boolean
  /** Mode ping : retourne { _statusCode, _ok } sans parser le body */
  isPing?: boolean
}

// Cache mémoire côté serveur : Map<url, { data, expiresAt }>
const cache = new Map<string, { data: unknown; expiresAt: number }>()

function getCached(url: string): unknown | null {
  const entry = cache.get(url)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) { cache.delete(url); return null }
  return entry.data
}

function setCached(url: string, data: unknown, ttlSeconds: number) {
  if (ttlSeconds <= 0) return
  cache.set(url, { data, expiresAt: Date.now() + ttlSeconds * 1000 })
}

export default defineEventHandler(async (event) => {
  const req = await readBody<ProxyRequest>(event)

  if (!req?.url) throw createError({ statusCode: 400, message: 'URL manquante' })

  // Validation SSRF
  try {
    const url = new URL(req.url)
    const h = url.hostname
    if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0'
      || h.startsWith('192.168.') || h.startsWith('10.')) {
      throw createError({ statusCode: 403, message: 'Accès réseau privé interdit' })
    }
  }
  catch (e: unknown) {
    if ((e as { statusCode?: number }).statusCode) throw e
    throw createError({ statusCode: 400, message: 'URL invalide' })
  }

  const isGet = (req.method ?? 'GET') === 'GET'
  const ttl = req.cacheTtl ?? 120  // 2 min par défaut

  // Retourner le cache si disponible (GET uniquement)
  if (isGet && !req.forceRefresh) {
    const cached = getCached(req.url)
    if (cached !== null) return cached
  }

  const fetchOptions: RequestInit = {
    method: req.method ?? 'GET',
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'StatusDashboard/1.0',
      ...(req.headers ?? {}),
    },
  }

  if (req.method === 'POST' && req.body) {
    fetchOptions.body = req.body
    ;(fetchOptions.headers as Record<string, string>)['Content-Type'] = 'application/json'
  }

  const response = await fetch(req.url, fetchOptions)

  // Mode ping : retourner le code HTTP sans parser le body
  if (req.isPing) {
    return { _statusCode: response.status, _ok: response.ok }
  }

  if (!response.ok) {
    throw createError({
      statusCode: response.status,
      message: `Erreur HTTP ${response.status} depuis ${req.url}`,
    })
  }

  const contentType = response.headers.get('content-type') ?? ''
  const data = contentType.includes('application/json')
    ? await response.json()
    : { _raw: await response.text() }

  // Mettre en cache (GET uniquement)
  if (isGet) setCached(req.url, data, ttl)

  return data
})
