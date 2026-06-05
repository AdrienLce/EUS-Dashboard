/**
 * @module composables/useServerConfig
 *
 * Gestion de la configuration persistante avec stratégie serveur-first.
 *
 * ## Stratégie de persistance
 *
 * La configuration (services, composites, ordre d'affichage) est sauvegardée
 * à deux endroits en parallèle :
 *
 * 1. **Serveur (Nitro fs storage)** : stockage principal, persiste entre les navigateurs
 *    et les rechargements. Accessible via `GET/POST /api/config`.
 * 2. **localStorage** : cache offline, permet l'accès à la config même si le serveur
 *    est temporairement inaccessible.
 *
 * ## Ordre de priorité au chargement
 *
 * ```
 * load() appelée au mount
 *   ├── Essaie GET /api/config
 *   │   ├── Serveur a des données → utilise les données serveur
 *   │   ├── Serveur vide + localStorage a des données → MIGRATION AUTO
 *   │   │   └── copie localStorage → serveur via POST /api/config
 *   │   └── Serveur et localStorage vides → état initial vide
 *   └── Erreur réseau → fallback localStorage (mode offline)
 * ```
 *
 * ## Migration automatique
 *
 * Si l'application est déployée sur un nouveau serveur (storage vide) mais que
 * l'utilisateur avait déjà des services configurés dans son localStorage (ancienne
 * installation sans serveur, ou mode développement), la migration est automatique
 * et transparente : les données sont copiées vers le serveur sans intervention.
 *
 * ## État module-level (singleton)
 *
 * Les refs `services`, `composites`, `order`, `loaded` sont déclarées au niveau
 * module. Tous les composants qui appellent `useServerConfig()` partagent
 * le même état réactif — c'est un store léger sans Pinia.
 */

import type { ServiceConfig, CompositeServiceConfig } from '~/types'

// Clés localStorage
const LS_SERVICES = 'status-dashboard-services'
const LS_COMPOSITES = 'status-dashboard-composites'
const LS_ORDER = 'status-dashboard-order'

// État partagé entre toutes les instances du composable (singleton)
const services = ref<ServiceConfig[]>([])
const composites = ref<CompositeServiceConfig[]>([])
const order = ref<string[]>([])
const theme = ref<string>('light')
const pageStyle = ref<string>('box')
const accessControl = ref<unknown>(null)
/** true une fois que load() a terminé (succès ou échec) */
const loaded = ref(false)
/** Promise en cours — évite les appels concurrents à load() */
let loadPromise: Promise<void> | null = null

/**
 * Lit l'ensemble de la configuration depuis localStorage.
 * Retourne des tableaux vides en cas d'erreur de parsing JSON.
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
 * Charge la configuration depuis le serveur avec fallback localStorage.
 * Appelée automatiquement au premier accès côté client.
 *
 * Ne fait rien si exécutée côté serveur (SSR) car localStorage n'existe pas.
 */
async function load() {
  if (!import.meta.client) return
  try {
    const data = await $fetch<{ services: ServiceConfig[]; composites: CompositeServiceConfig[]; order: string[] }>('/api/config')
    const serverEmpty = (!data.services?.length && !data.composites?.length)
    const ls = readLocalStorage()
    const lsHasData = ls.services.length > 0 || ls.composites.length > 0

    if (serverEmpty && lsHasData) {
      // Migration automatique : localStorage → serveur (premier déploiement avec storage)
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
    // Serveur inaccessible (dev hors ligne, réseau) → fallback localStorage
    const ls = readLocalStorage()
    services.value = ls.services
    composites.value = ls.composites
    order.value = ls.order
  }
  loaded.value = true
}

/**
 * Sauvegarde une partie de la configuration (services OU composites OU order).
 * Écrit simultanément dans localStorage (synchrone) et sur le serveur (async best-effort).
 *
 * La sauvegarde est partielle pour éviter les conflits si deux onglets modifient
 * des parties différentes de la configuration.
 *
 * @param key - Quelle partie de la configuration sauvegarder
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

  // Persistance serveur (async, best-effort — on ne bloque pas sur erreur)
  try { await $fetch('/api/config', { method: 'POST', body: payload }) }
  catch { /* Serveur indisponible — les données sont au moins dans localStorage */ }
}

/**
 * Composable exposant la configuration partagée des services et composites.
 *
 * @returns Refs réactives et fonctions de persistance
 *
 * @example
 * const { services, composites, order, loaded, save } = useServerConfig()
 *
 * // Attendre que la config soit chargée
 * watch(loaded, (isLoaded) => {
 *   if (isLoaded) console.log('Services:', services.value)
 * })
 */
export function useServerConfig() {
  // Déduplique : une seule promise en vol, load() ne s'exécute qu'une fois
  if (import.meta.client && !loaded.value && !loadPromise) {
    loadPromise = load().finally(() => { loadPromise = null })
  }
  return { services, composites, order, theme, pageStyle, accessControl, load, save, loaded }
}
