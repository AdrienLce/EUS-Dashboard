/**
 * Config partagée côté serveur (Nitro fs storage).
 * Fallback localStorage pour offline/dev rapide.
 * Sync : charge du serveur au mount, sauvegarde au serveur + localStorage à chaque changement.
 */
import type { ServiceConfig, CompositeServiceConfig } from '~/types'

const LS_SERVICES = 'status-dashboard-services'
const LS_COMPOSITES = 'status-dashboard-composites'
const LS_ORDER = 'status-dashboard-order'

const services = ref<ServiceConfig[]>([])
const composites = ref<CompositeServiceConfig[]>([])
const order = ref<string[]>([])
const loaded = ref(false)

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

async function load() {
  if (!import.meta.client) return
  try {
    const data = await $fetch<{ services: ServiceConfig[]; composites: CompositeServiceConfig[]; order: string[] }>('/api/config')
    const serverEmpty = (!data.services?.length && !data.composites?.length)
    const ls = readLocalStorage()
    const lsHasData = ls.services.length > 0 || ls.composites.length > 0

    if (serverEmpty && lsHasData) {
      // Migration automatique localStorage → serveur
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
    }
  }
  catch {
    // Serveur inaccessible → fallback localStorage
    const ls = readLocalStorage()
    services.value = ls.services
    composites.value = ls.composites
    order.value = ls.order
  }
  loaded.value = true
}

async function save(key: 'services' | 'composites' | 'order') {
  if (!import.meta.client) return
  const payload = {
    services: key === 'services' ? services.value : undefined,
    composites: key === 'composites' ? composites.value : undefined,
    order: key === 'order' ? order.value : undefined,
  }
  // Persist localStorage (cache offline)
  if (key === 'services') localStorage.setItem(LS_SERVICES, JSON.stringify(services.value))
  if (key === 'composites') localStorage.setItem(LS_COMPOSITES, JSON.stringify(composites.value))
  if (key === 'order') localStorage.setItem(LS_ORDER, JSON.stringify(order.value))
  // Persist server
  try { await $fetch('/api/config', { method: 'POST', body: payload }) }
  catch { /* best-effort */ }
}

export function useServerConfig() {
  if (import.meta.client && !loaded.value) load()
  return { services, composites, order, load, save, loaded }
}
