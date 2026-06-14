/**
 * @module server/api/proxy.post
 *
 * Server-side HTTP proxy with in-memory cache.
 *
 * ## Cache
 *
 * Each GET response is cached in memory for `cacheTtl` seconds
 * (default: 120s). Requests to the same URL within this window return
 * the cached response without calling the external service again.
 *
 * This avoids 429 (Too Many Requests) errors on services that rate-limit
 * repeated calls from the same server IP.
 *
 * The client can force a refresh by passing `{ forceRefresh: true }`.
 */

import { defineEventHandler, readBody, createError } from 'h3'

interface ProxyRequest {
  url: string
  method: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: string
  /** Cache TTL in seconds (default: 120). 0 = no cache. */
  cacheTtl?: number
  /** Ignores the cache and forces a new call */
  forceRefresh?: boolean
  /** Ping mode: returns { _statusCode, _ok } without parsing the body */
  isPing?: boolean
}

// Server-side in-memory cache: Map<url, { data, expiresAt }>
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

  if (!req?.url) throw createError({ statusCode: 400, message: 'Missing URL' })

  // SSRF validation
  try {
    const url = new URL(req.url)
    const h = url.hostname
    if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0'
      || h.startsWith('192.168.') || h.startsWith('10.')) {
      throw createError({ statusCode: 403, message: 'Private network access forbidden' })
    }
  }
  catch (e: unknown) {
    if ((e as { statusCode?: number }).statusCode) throw e
    throw createError({ statusCode: 400, message: 'URL invalide' })
  }

  const isGet = (req.method ?? 'GET') === 'GET'
  const ttl = req.cacheTtl ?? 120  // 2 min by default

  // Return the cache if available (GET only)
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

  // Ping mode: return the HTTP status code without parsing the body
  if (req.isPing) {
    return { _statusCode: response.status, _ok: response.ok }
  }

  if (!response.ok) {
    throw createError({
      statusCode: response.status,
      message: `HTTP error ${response.status} from ${req.url}`,
    })
  }

  const contentType = response.headers.get('content-type') ?? ''
  const data = contentType.includes('application/json')
    ? await response.json()
    : { _raw: await response.text() }

  // Store in cache (GET only)
  if (isGet) setCached(req.url, data, ttl)

  return data
})
