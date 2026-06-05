/**
 * @module composables/useComposites
 *
 * CRUD des services composites et de leurs enfants (sous-services).
 *
 * Un service composite regroupe plusieurs URL sous un même service logique,
 * toutes pollées au même intervalle. Il expose deux niveaux de gestion :
 * - Le composite lui-même (name, group, pollInterval, defaultAdapter, defaultMapping)
 * - Ses enfants (SubServiceConfig) qui peuvent hériter ou surcharger la config du parent
 *
 * Les IDs sont générés via `crypto.randomUUID()` à la création (composite ET enfants).
 * Le discriminant `type: "composite"` est injecté automatiquement.
 */

import { computed } from 'vue'
import type { CompositeServiceConfig, SubServiceConfig } from '~/types'
import { useServerConfig } from './useServerConfig'

/**
 * Composable de gestion CRUD des services composites.
 *
 * @example
 * const { addComposite, addChild, updateChild } = useComposites()
 *
 * // Créer un composite avec un adapter par défaut
 * const composite = addComposite({
 *   name: 'Mon infrastructure',
 *   pollInterval: 60,
 *   enabled: true,
 *   defaultAdapter: 'custom',
 *   defaultMapping: { statusPath: 'status', levelMap: { 'up': 'operational' } },
 *   children: [],
 * })
 *
 * // Ajouter un enfant (hérite du defaultAdapter et defaultMapping)
 * addChild(composite.id, {
 *   name: 'Service A',
 *   url: 'https://a.example.com/health',
 *   method: 'GET',
 *   headers: {},
 *   adapter: '',  // vide = hérite du composite
 *   enabled: true,
 * })
 */
export function useComposites() {
  const { composites, save } = useServerConfig()

  /**
   * Crée un nouveau service composite avec UUID, type et date de création générés.
   *
   * @param config - Configuration sans id, type ni createdAt
   * @returns Le CompositeServiceConfig complet
   */
  function addComposite(config: Omit<CompositeServiceConfig, 'id' | 'createdAt' | 'type'>): CompositeServiceConfig {
    const c: CompositeServiceConfig = {
      ...config,
      id: crypto.randomUUID(),
      type: 'composite',
      createdAt: new Date().toISOString(),
    }
    composites.value.push(c)
    save('composites')
    return c
  }

  /**
   * Met à jour les propriétés d'un composite existant.
   * Peut modifier defaultAdapter, defaultMapping, name, pollInterval, etc.
   *
   * @param id      - ID du composite à modifier
   * @param updates - Patch partiel (sans id, type, createdAt)
   */
  function updateComposite(id: string, updates: Partial<Omit<CompositeServiceConfig, 'id' | 'createdAt' | 'type'>>) {
    const idx = composites.value.findIndex(c => c.id === id)
    if (idx === -1) return
    composites.value[idx] = { ...composites.value[idx], ...updates }
    save('composites')
  }

  /**
   * Supprime un composite et tous ses enfants.
   *
   * @param id - ID du composite à supprimer
   */
  function removeComposite(id: string) {
    composites.value = composites.value.filter(c => c.id !== id)
    save('composites')
  }

  /**
   * Inverse l'état enabled/disabled d'un composite.
   * N'affecte pas l'état enabled des enfants individuellement.
   *
   * @param id - ID du composite à basculer
   */
  function toggleComposite(id: string) {
    const c = composites.value.find(c => c.id === id)
    if (c) updateComposite(id, { enabled: !c.enabled })
  }

  /**
   * Ajoute un sous-service à un composite existant.
   * Un UUID est généré pour l'enfant.
   *
   * @param compositeId - ID du composite parent
   * @param child       - Configuration de l'enfant sans id
   * @returns Le SubServiceConfig complet avec id
   * @throws Error si le composite n'existe pas
   */
  function addChild(compositeId: string, child: Omit<SubServiceConfig, 'id'>): SubServiceConfig {
    const idx = composites.value.findIndex(c => c.id === compositeId)
    if (idx === -1) throw new Error('Composite not found')
    const sub: SubServiceConfig = { ...child, id: crypto.randomUUID() }
    composites.value[idx].children.push(sub)
    save('composites')
    return sub
  }

  /**
   * Met à jour les propriétés d'un enfant spécifique d'un composite.
   * Peut modifier l'adapter, le mapping, l'URL, etc.
   * Silencieux si composite ou enfant non trouvé.
   *
   * @param compositeId - ID du composite parent
   * @param childId     - ID de l'enfant à modifier
   * @param updates     - Patch partiel (sans id)
   */
  function updateChild(compositeId: string, childId: string, updates: Partial<Omit<SubServiceConfig, 'id'>>) {
    const c = composites.value.find(c => c.id === compositeId)
    if (!c) return
    const ci = c.children.findIndex(ch => ch.id === childId)
    if (ci === -1) return
    c.children[ci] = { ...c.children[ci], ...updates }
    save('composites')
  }

  /**
   * Supprime un enfant d'un composite.
   *
   * @param compositeId - ID du composite parent
   * @param childId     - ID de l'enfant à supprimer
   */
  function removeChild(compositeId: string, childId: string) {
    const c = composites.value.find(c => c.id === compositeId)
    if (!c) return
    c.children = c.children.filter(ch => ch.id !== childId)
    save('composites')
  }

  /**
   * Inverse l'état enabled/disabled d'un enfant spécifique.
   *
   * @param compositeId - ID du composite parent
   * @param childId     - ID de l'enfant à basculer
   */
  function toggleChild(compositeId: string, childId: string) {
    const c = composites.value.find(c => c.id === compositeId)
    const ch = c?.children.find(ch => ch.id === childId)
    if (ch) updateChild(compositeId, childId, { enabled: !ch.enabled })
  }

  return {
    /** Liste réactive de tous les composites */
    composites: computed(() => composites.value),
    /** Liste réactive des composites actifs */
    enabledComposites: computed(() => composites.value.filter(c => c.enabled)),
    addComposite,
    updateComposite,
    removeComposite,
    toggleComposite,
    addChild,
    updateChild,
    removeChild,
    toggleChild,
  }
}
