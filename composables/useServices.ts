import { computed } from 'vue'
import type { ServiceConfig } from '~/types'
import { useServerConfig } from './useServerConfig'

export function useServices() {
  const { services, save } = useServerConfig()

  function addService(config: Omit<ServiceConfig, 'id' | 'createdAt'>): ServiceConfig {
    const svc: ServiceConfig = { ...config, id: crypto.randomUUID(), createdAt: new Date().toISOString() }
    services.value.push(svc)
    save('services')
    return svc
  }

  function updateService(id: string, updates: Partial<Omit<ServiceConfig, 'id' | 'createdAt'>>) {
    const idx = services.value.findIndex(s => s.id === id)
    if (idx === -1) return
    services.value[idx] = { ...services.value[idx], ...updates }
    save('services')
  }

  function removeService(id: string) {
    services.value = services.value.filter(s => s.id !== id)
    save('services')
  }

  function toggleService(id: string) {
    const svc = services.value.find(s => s.id === id)
    if (svc) updateService(id, { enabled: !svc.enabled })
  }

  return {
    services: computed(() => services.value),
    enabledServices: computed(() => services.value.filter(s => s.enabled)),
    addService,
    updateService,
    removeService,
    toggleService,
  }
}
