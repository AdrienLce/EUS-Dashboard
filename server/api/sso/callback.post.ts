/**
 * Échange le code d'autorisation OIDC contre des tokens (PKCE flow).
 * Appelé par la page /auth/callback après la redirection de l'IdP.
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

  // Échange code → tokens via PKCE (sans client_secret)
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

  // Poser un cookie de session httpOnly (1h par défaut)
  setCookie(event, 'sso_session', tokens.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: tokens.expires_in ?? 3600,
    path: '/',
  })

  return { ok: true }
})
