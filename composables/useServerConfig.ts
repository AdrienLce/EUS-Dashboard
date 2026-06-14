/**
 * @module composables/useServerConfig
 *
 * Management of persistent configuration with a server-first strategy.
 *
 * ## Persistence strategy
 *
 * The configuration (services, composites, display order) is saved
 * to two locations in parallel:
 *
 * 1. **Server (Nitro fs storage)**: primary storage, persists across browsers
 *    and reloads. Accessible via `GET/POST /api/config`.
 * 2. **localStorage**: offline cache, allows access to the config even if the server
 *    is temporarily unreachable.
 *
 * ## Priority order on load
 *
 * ```
 * load() called on mount
 *   ├── Tries GET /api/config
 *   │   ├── Server has data → uses server data
 *   │   ├── Server empty + localStorage has data → AUTO MIGRATION
 *   │   │   └── copies localStorage → server via POST /api/config
 *   │   └── Server and localStorage empty → empty initial state
 *   └── Network error → localStorage fallback (offline mode)
 * ```
 *
 * ## Automatic migration
 *
 * If the application is deployed on a new server (empty storage) but the
 * user already had services configured in their localStorage (an old
 * installation without a server, or development mode), migration is automatic
 * and transparent: the data is copied to the server without any intervention.
 *
 * ## Module-level state (singleton)
 *
 * The `services`, `composites`, `order`, `loaded` refs are declared at the module
 * level. All components that call `useServerConfig()` share
 * the same reactive state — it is a lightweight store without Pinia.
 */

import type { ServiceConfig, CompositeServiceConfig } from '~/types'

// localStorage keys
const LS_SERVICES = 'status-dashboard-services'
const LS_COMPOSITES = 'status-dashboard-composites'
const LS_ORDER = 'status-dashboard-order'

// State shared across all instances of the composable (singleton)
const services = ref<ServiceConfig[]>([])
const composites = ref<CompositeServiceConfig[]>([])
const order = ref<string[]>([])
const theme = ref<string>('light')
const pageStyle = ref<string>('box')
const accessControl = ref<unknown>(null)
/** true once load() has finished (success or failure) */
const loaded = ref(false)
/** In-flight promise — prevents concurrent calls to load() */
let loadPromise: Promise<void> | null = null

/**
 * Reads the entire configuration from localStorage.
 * Returns empty arrays on JSON parsing error.
 */
function readLocalStorage() {
  try {
    return {
      services: JSON.parse(localStorage.getItem(LS_SERVICES) ?? '[]') as ServiceConfig[],
      composites: JSON.parse(localStorage.getItem(LS_COMPOSITES) ?? '[]') as CompositeServiceConfig[],
      order: JSON.parse(localStorage.getItem(LS_ORDER) ?? '[]') as string[],
    }
  }
  catch { return { services: [], composites: [], order: [] } }
}

/**
 * Loads the configuration from the server with a localStorage fallback.
 * Called automatically on first client-side access.
 *
 * Does nothing if run server-side (SSR) since localStorage does not exist.
 */
async function load() {
  if (!import.meta.client) return
  try {
    const data = await $fetch<{ services: ServiceConfig[]; composites: CompositeServiceConfig[]; order: string[] }>('/api/config')
    const serverEmpty = (!data.services?.length && !data.composites?.length)
    const ls = readLocalStorage()
    const lsHasData = ls.services.length > 0 || ls.composites.length > 0

    if (serverEmpty && lsHasData) {
      // Automatic migration: localStorage → server (first deployment with storage)
      services.value = ls.services
      composites.value = ls.composites
      order.value = ls.order
      await $fetch('/api/config', {
        method: 'POST',
        body: { services: ls.services, composites: ls.composites, order: ls.order },
      })
      console.info('[config] Données migrées depuis localStorage vers le serveur.')
    }
    else {
      services.value = data.services ?? []
      composites.value = data.composites ?? []
      order.value = data.order ?? []
      if ((data as any).theme) theme.value = (data as any).theme
      if ((data as any).pageStyle) pageStyle.value = (data as any).pageStyle
      if ((data as any).accessControl) accessControl.value = (data as any).accessControl
    }
  }
  catch {
    // Server unreachable (offline dev, network) → localStorage fallback
    const ls = readLocalStorage()
    services.value = ls.services
    composites.value = ls.composites
    order.value = ls.order
  }
  loaded.value = true
}

/**
 * Saves part of the configuration (services OR composites OR order).
 * Writes simultaneously to localStorage (synchronous) and to the server (async, best-effort).
 *
 * The save is partial to avoid conflicts if two tabs modify
 * different parts of the configuration.
 *
 * @param key - Which part of the configuration to save
 */
async function save(key: 'services' | 'composites' | 'order' | 'levels' | 'theme' | 'pageStyle' | 'accessControl') {
  if (!import.meta.client) return

  const payload: Record<string, unknown> = {}
  if (key === 'services')       { payload.services       = services.value;       localStorage.setItem(LS_SERVICES,   JSON.stringify(services.value)) }
  if (key === 'composites')     { payload.composites     = composites.value;     localStorage.setItem(LS_COMPOSITES, JSON.stringify(composites.value)) }
  if (key === 'order')          { payload.order          = order.value;          localStorage.setItem(LS_ORDER,      JSON.stringify(order.value)) }
  if (key === 'theme')          { payload.theme          = theme.value;          localStorage.setItem('status-theme',       theme.value) }
  if (key === 'pageStyle')      { payload.pageStyle      = pageStyle.value;      localStorage.setItem('status-page-style',  pageStyle.value) }
  if (key === 'accessControl')  { payload.accessControl  = accessControl.value }

  // Server persistence (async, best-effort — we don't block on error)
  try { await $fetch('/api/config', { method: 'POST', body: payload }) }
  catch { /* Server unavailable — the data is at least in localStorage */ }
}

/**
 * Composable exposing the shared configuration of services and composites.
 *
 * @returns Reactive refs and persistence functions
 *
 * @example
 * const { services, composites, order, loaded, save } = useServerConfig()
 *
 * // Wait for the config to be loaded
 * watch(loaded, (isLoaded) => {
 *   if (isLoaded) console.log('Services:', services.value)
 * })
 */
export function useServerConfig() {
  // Deduplicates: a single in-flight promise, load() runs only once
  if (import.meta.client && !loaded.value && !loadPromise) {
    loadPromise = load().finally(() => { loadPromise = null })
  }
  return { services, composites, order, theme, pageStyle, accessControl, load, save, loaded }
}
