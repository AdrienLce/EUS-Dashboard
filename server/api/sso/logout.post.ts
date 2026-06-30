import { defineEventHandler, deleteCookie } from 'h3'

export default defineEventHandler((event) => {
  // Clear both session kinds so logout works regardless of the access mode
  deleteCookie(event, 'sso_session', { path: '/' })
  deleteCookie(event, 'pw_session', { path: '/' })
  return { ok: true }
})
