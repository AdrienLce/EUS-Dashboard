/**
 * @module composables/useComposites
 *
 * CRUD for composite services and their children (sub-services).
 *
 * A composite service groups several URLs under a single logical service,
 * all polled at the same interval. It exposes two levels of management:
 * - The composite itself (name, group, pollInterval, defaultAdapter, defaultMapping)
 * - Its children (SubServiceConfig), which can inherit or override the parent's config
 *
 * IDs are generated via `crypto.randomUUID()` on creation (composite AND children).
 * The `type: "composite"` discriminant is injected automatically.
 */

import { computed } from 'vue'
import type { CompositeServiceConfig, SubServiceConfig } from '~/types'
import { useServerConfig } from './useServerConfig'

/**
 * Composable for CRUD management of composite services.
 *
 * @example
 * const { addComposite, addChild, updateChild } = useComposites()
 *
 * // Create a composite with a default adapter
 * const composite = addComposite({
 *   name: 'Mon infrastructure',
 *   pollInterval: 60,
 *   enabled: true,
 *   defaultAdapter: 'custom',
 *   defaultMapping: { statusPath: 'status', levelMap: { 'up': 'operational' } },
 *   children: [],
 * })
 *
 * // Add a child (inherits defaultAdapter and defaultMapping)
 * addChild(composite.id, {
 *   name: 'Service A',
 *   url: 'https://a.example.com/health',
 *   method: 'GET',
 *   headers: {},
 *   adapter: '',  // empty = inherits from the composite
 *   enabled: true,
 * })
 */
export function useComposites() {
  const { composites, save } = useServerConfig()

  /**
   * Creates a new composite service with generated UUID, type, and creation date.
   *
   * @param config - Configuration without id, type, or createdAt
   * @returns The complete CompositeServiceConfig
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
   * Updates the properties of an existing composite.
   * Can modify defaultAdapter, defaultMapping, name, pollInterval, etc.
   *
   * @param id      - ID of the composite to update
   * @param updates - Partial patch (without id, type, createdAt)
   */
  function updateComposite(id: string, updates: Partial<Omit<CompositeServiceConfig, 'id' | 'createdAt' | 'type'>>) {
    const idx = composites.value.findIndex(c => c.id === id)
    if (idx === -1) return
    composites.value[idx] = { ...composites.value[idx], ...updates }
    save('composites')
  }

  /**
   * Removes a composite and all of its children.
   *
   * @param id - ID of the composite to remove
   */
  function removeComposite(id: string) {
    composites.value = composites.value.filter(c => c.id !== id)
    save('composites')
  }

  /**
   * Toggles the enabled/disabled state of a composite.
   * Does not affect the enabled state of children individually.
   *
   * @param id - ID of the composite to toggle
   */
  function toggleComposite(id: string) {
    const c = composites.value.find(c => c.id === id)
    if (c) updateComposite(id, { enabled: !c.enabled })
  }

  /**
   * Adds a sub-service to an existing composite.
   * A UUID is generated for the child.
   *
   * @param compositeId - ID of the parent composite
   * @param child       - Configuration of the child without id
   * @returns The complete SubServiceConfig with id
   * @throws Error if the composite does not exist
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
   * Updates the properties of a specific child of a composite.
   * Can modify the adapter, the mapping, the URL, etc.
   * Silent if the composite or child is not found.
   *
   * @param compositeId - ID of the parent composite
   * @param childId     - ID of the child to update
   * @param updates     - Partial patch (without id)
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
   * Removes a child from a composite.
   *
   * @param compositeId - ID of the parent composite
   * @param childId     - ID of the child to remove
   */
  function removeChild(compositeId: string, childId: string) {
    const c = composites.value.find(c => c.id === compositeId)
    if (!c) return
    c.children = c.children.filter(ch => ch.id !== childId)
    save('composites')
  }

  /**
   * Toggles the enabled/disabled state of a specific child.
   *
   * @param compositeId - ID of the parent composite
   * @param childId     - ID of the child to toggle
   */
  function toggleChild(compositeId: string, childId: string) {
    const c = composites.value.find(c => c.id === compositeId)
    const ch = c?.children.find(ch => ch.id === childId)
    if (ch) updateChild(compositeId, childId, { enabled: !ch.enabled })
  }

  return {
    /** Reactive list of all composites */
    composites: computed(() => composites.value),
    /** Reactive list of active composites */
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
