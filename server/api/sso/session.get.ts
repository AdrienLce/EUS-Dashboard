/** Vérifie si le cookie de session SSO est présent (lecture côté serveur). */
import { defineEventHandler, getCookie } from 'h3'

export default defineEventHandler((event) => {
  const session = getCookie(event, 'sso_session')
  return { authenticated: !!session }
})
