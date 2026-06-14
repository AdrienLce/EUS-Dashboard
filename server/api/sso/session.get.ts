/** Checks whether the SSO session cookie is present (server-side read). */
import { defineEventHandler, getCookie } from 'h3'

export default defineEventHandler((event) => {
  const session = getCookie(event, 'sso_session')
  return { authenticated: !!session }
})
