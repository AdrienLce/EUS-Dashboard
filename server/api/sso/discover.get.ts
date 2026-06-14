/**
 * Proxy for the OIDC discovery document.
 * Needed to avoid CORS errors when fetching
 * the .well-known/openid-configuration from the browser.
 */
import { defineEventHandler, getQuery, createError } from 'h3'

export default defineEventHandler(async (event) => {
  const { url } = getQuery(event)
  if (!url || typeof url !== 'string') throw createError({ statusCode: 400, message: 'url manquante' })

  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) throw createError({ statusCode: res.status, message: `Discovery failed: ${res.status}` })
    return await res.json()
  }
  catch (e: unknown) {
    throw createError({ statusCode: 502, message: `Impossible de contacter l'IdP : ${(e as Error).message}` })
  }
})
