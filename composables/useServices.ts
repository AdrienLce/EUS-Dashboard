/**
 * @module composables/useServices
 *
 * CRUD des services simples avec persistance automatique.
 *
 * Couche d'abstraction au-dessus de useServerConfig qui fournit des opérations
 * de haut niveau (add, update, remove, toggle) avec sauvegarde automatique
 * après chaque mutation.
 *
 * Les IDs sont générés automatiquement via `crypto.randomUUID()` à la création.
 * La date de création est fixée à la création et ne change plus ensuite.
 */

import { computed } from 'vue'
import type { ServiceConfig } from '~/types'
import { useServerConfig } from './useServerConfig'

/**
 * Composable de gestion CRUD des services simples.
 *
 * @example
 * const { services, addService, updateService, removeService, toggleService } = useServices()
 *
 * // Ajouter un nouveau service
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
   * Crée un nouveau service avec un UUID généré et une date de création.
   * L'ajout est immédiatement persisté via useServerConfig.
   *
   * @param config - Configuration du service sans id ni createdAt (générés automatiquement)
   * @returns Le ServiceConfig complet avec id et createdAt
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
   * Met à jour les propriétés d'un service existant (sans modifier id ni createdAt).
   * Silencieux si l'ID n'existe pas.
   *
   * @param id      - ID du service à modifier
   * @param updates - Propriétés à modifier (patch partiel)
   */
  function updateService(id: string, updates: Partial<Omit<ServiceConfig, 'id' | 'createdAt'>>) {
    const idx = services.value.findIndex(s => s.id === id)
    if (idx === -1) return
    services.value[idx] = { ...services.value[idx], ...updates }
    save('services')
  }

  /**
   * Supprime un service par son ID.
   * Note : les snapshots et l'historique dans useStatusStore ne sont pas supprimés
   * automatiquement (ils deviennent orphelins et disparaissent au prochain rechargement).
   *
   * @param id - ID du service à supprimer
   */
  function removeService(id: string) {
    services.value = services.value.filter(s => s.id !== id)
    save('services')
  }

  /**
   * Inverse l'état enabled/disabled d'un service.
   *
   * @param id - ID du service à basculer
   */
  function toggleService(id: string) {
    const svc = services.value.find(s => s.id === id)
    if (svc) updateService(id, { enabled: !svc.enabled })
  }

  return {
    /** Liste réactive de tous les services (actifs et inactifs) */
    services: computed(() => services.value),
    /** Liste réactive des services actifs uniquement */
    enabledServices: computed(() => services.value.filter(s => s.enabled)),
    addService,
    updateService,
    removeService,
    toggleService,
  }
}
