/**
 * Exchanges the OIDC authorization code for tokens (PKCE flow).
 * Called by the /auth/callback page after the redirect from the IdP.
 */
import { defineEventHandler, readBody, createError, setCookie } from 'h3'

interface CallbackBody {
  code: string
  codeVerifier: string
  tokenEndpoint: string
  clientId: string
  redirectUri: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<CallbackBody>(event)
  const { code, codeVerifier, tokenEndpoint, clientId, redirectUri } = body

  if (!code || !codeVerifier || !tokenEndpoint || !clientId) {
    throw createError({ statusCode: 400, message: 'Paramètres manquants' })
  }

  // Exchange code → tokens via PKCE (without client_secret)
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    code_verifier: codeVerifier,
    client_id: clientId,
    redirect_uri: redirectUri,
  })

  const res = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  if (!res.ok) {
    const err = await res.text()
    throw createError({ statusCode: 401, message: `Token exchange failed: ${err}` })
  }

  const tokens = await res.json() as { access_token: string; id_token?: string; expires_in?: number }

  // Set an httpOnly session cookie (1h by default)
  setCookie(event, 'sso_session', tokens.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: tokens.expires_in ?? 3600,
    path: '/',
  })

  return { ok: true }
})
