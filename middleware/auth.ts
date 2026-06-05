/**
 * Middleware de protection de /services.
 * Redirige vers une page de login si le mode d'accès est activé
 * et que l'utilisateur n'est pas authentifié.
 */
import { useAccessControl } from '~/composables/useAccessControl'

const PROTECTED_PATHS = ['/services', '/settings']

export default defineNuxtRouteMiddleware((to) => {
  if (!PROTECTED_PATHS.includes(to.path)) return
  const { isProtected, hasAccess } = useAccessControl()
  if (isProtected() && !hasAccess()) {
    return navigateTo(`/auth/login?returnTo=${encodeURIComponent(to.fullPath)}`)
  }
})
