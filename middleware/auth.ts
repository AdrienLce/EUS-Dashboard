/**
 * Middleware protecting /services.
 * Redirects to a login page if access mode is enabled
 * and the user is not authenticated.
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
