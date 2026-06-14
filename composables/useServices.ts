/**
 * @module composables/useServices
 *
 * CRUD for simple services with automatic persistence.
 *
 * An abstraction layer on top of useServerConfig that provides high-level
 * operations (add, update, remove, toggle) with automatic saving
 * after each mutation.
 *
 * IDs are generated automatically via `crypto.randomUUID()` at creation time.
 * The creation date is set at creation and never changes afterward.
 */

import { computed } from 'vue'
import type { ServiceConfig } from '~/types'
import { useServerConfig } from './useServerConfig'

/**
 * CRUD management composable for simple services.
 *
 * @example
 * const { services, addService, updateService, removeService, toggleService } = useServices()
 *
 * // Add a new service
 * const svc = addService({
 *   name: 'Mon API',
 *   url: 'https://api.example.com/health',
 *   method: 'GET',
 *   headers: {},
 *   adapter: 'custom',
 *   customMapping: { statusPath: 'status', levelMap: { 'ok': 'operational' } },
 *   pollInterval: 60,
 *   enabled: true,
 * })
 */
export function useServices() {
  const { services, save } = useServerConfig()

  /**
   * Creates a new service with a generated UUID and a creation date.
   * The addition is immediately persisted via useServerConfig.
   *
   * @param config - Service configuration without id or createdAt (generated automatically)
   * @returns The complete ServiceConfig with id and createdAt
   */
  function addService(config: Omit<ServiceConfig, 'id' | 'createdAt'>): ServiceConfig {
    const svc: ServiceConfig = {
      ...config,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    }
    services.value.push(svc)
    save('services')
    return svc
  }

  /**
   * Updates the properties of an existing service (without modifying id or createdAt).
   * Silent if the ID does not exist.
   *
   * @param id      - ID of the service to modify
   * @param updates - Properties to modify (partial patch)
   */
  function updateService(id: string, updates: Partial<Omit<ServiceConfig, 'id' | 'createdAt'>>) {
    const idx = services.value.findIndex(s => s.id === id)
    if (idx === -1) return
    services.value[idx] = { ...services.value[idx], ...updates }
    save('services')
  }

  /**
   * Removes a service by its ID.
   * Note: snapshots and history in useStatusStore are not removed
   * automatically (they become orphaned and disappear on the next reload).
   *
   * @param id - ID of the service to remove
   */
  function removeService(id: string) {
    services.value = services.value.filter(s => s.id !== id)
    save('services')
  }

  /**
   * Toggles the enabled/disabled state of a service.
   *
   * @param id - ID of the service to toggle
   */
  function toggleService(id: string) {
    const svc = services.value.find(s => s.id === id)
    if (svc) updateService(id, { enabled: !svc.enabled })
  }

  return {
    /** Reactive list of all services (enabled and disabled) */
    services: computed(() => services.value),
    /** Reactive list of enabled services only */
    enabledServices: computed(() => services.value.filter(s => s.enabled)),
    addService,
    updateService,
    removeService,
    toggleService,
  }
}
