/**
 * @module server/middleware/auth
 *
 * Server-side authentication for the privileged API surface.
 *
 * The client route middleware (`middleware/auth.ts`) only guards the *pages*
 * `/services` and `/settings`; it cannot protect the API itself. This Nitro
 * middleware enforces the configured access mode on the endpoints that mutate
 * shared state or reach the network on the caller's behalf:
 *
 *   - POST /api/config   (rewrites the shared configuration)
 *   - /api/proxy         (server-side fetch — SSRF surface)
 *
 * GET /api/config stays open so the dashboard and the login page can bootstrap.
 * The /api/sso/* and /api/auth/* endpoints stay open so a user can authenticate.
 *
 * Auth is decided against the *stored* accessControl mode (not the request body),
 * so enabling protection for the first time — a POST that writes accessControl
 * while the stored mode is still 'none' — is not self-locking.
 *
 *   mode 'none'      → always allowed
 *   mode 'sso'       → requires a valid `sso_session` cookie (set by /api/sso/callback)
 *   mode 'password'  → requires a `pw_session` cookie equal to the stored passwordHash
 *                      (set by /api/auth/password)
 */
import { defineEventHandler, getCookie, getRequestURL, createError } from 'h3'

interface AccessControl {
  mode?: 'none' | 'password' | 'sso'
  passwordHash?: string
}

function requiresAuth(method: string, path: string): boolean {
  if (path === '/api/proxy') return true
  if (path === '/api/config' && method === 'POST') return true
  return false
}

export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname
  if (!requiresAuth(event.method, path)) return

  const storage = useStorage('config')
  const ac = (await storage.getItem<AccessControl>('accessControl')) ?? {}
  const mode = ac.mode ?? 'none'
  if (mode === 'none') return

  if (mode === 'sso') {
    if (getCookie(event, 'sso_session')) return
  }
  else if (mode === 'password') {
    const pw = getCookie(event, 'pw_session')
    if (pw && ac.passwordHash && pw === ac.passwordHash) return
  }

  throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
})
