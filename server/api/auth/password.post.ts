/**
 * Establishes a server-side password session.
 *
 * The client (useAccessControl.checkPassword) sends the SHA-256 hash of the
 * entered password. We compare it to the stored `accessControl.passwordHash`
 * and, on success, set an httpOnly `pw_session` cookie that the server auth
 * middleware checks on privileged API routes.
 *
 * The cookie value is the hash itself: possession proves knowledge of the
 * password, and changing the password invalidates all existing cookies.
 */
import { defineEventHandler, readBody, createError, setCookie } from 'h3'

interface AccessControl {
  mode?: string
  passwordHash?: string
}

export default defineEventHandler(async (event) => {
  const { hash } = await readBody<{ hash?: string }>(event)
  const storage = useStorage('config')
  const ac = (await storage.getItem<AccessControl>('accessControl')) ?? {}

  if (!ac.passwordHash) {
    throw createError({ statusCode: 400, message: 'Password authentication is not configured' })
  }
  if (!hash || hash !== ac.passwordHash) {
    throw createError({ statusCode: 401, message: 'Invalid password' })
  }

  setCookie(event, 'pw_session', hash, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 3600,
    path: '/',
  })

  return { ok: true }
})
