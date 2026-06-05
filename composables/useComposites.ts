import { computed } from 'vue'
import type { CompositeServiceConfig, SubServiceConfig } from '~/types'
import { useServerConfig } from './useServerConfig'

export function useComposites() {
  const { composites, save } = useServerConfig()

  function addComposite(config: Omit<CompositeServiceConfig, 'id' | 'createdAt' | 'type'>): CompositeServiceConfig {
    const c: CompositeServiceConfig = { ...config, id: crypto.randomUUID(), type: 'composite', createdAt: new Date().toISOString() }
    composites.value.push(c)
    save('composites')
    return c
  }

  function updateComposite(id: string, updates: Partial<Omit<CompositeServiceConfig, 'id' | 'createdAt' | 'type'>>) {
    const idx = composites.value.findIndex(c => c.id === id)
    if (idx === -1) return
    composites.value[idx] = { ...composites.value[idx], ...updates }
    save('composites')
  }

  function removeComposite(id: string) {
    composites.value = composites.value.filter(c => c.id !== id)
    save('composites')
  }

  function toggleComposite(id: string) {
    const c = composites.value.find(c => c.id === id)
    if (c) updateComposite(id, { enabled: !c.enabled })
  }

  function addChild(compositeId: string, child: Omit<SubServiceConfig, 'id'>): SubServiceConfig {
    const idx = composites.value.findIndex(c => c.id === compositeId)
    if (idx === -1) throw new Error('Composite not found')
    const sub: SubServiceConfig = { ...child, id: crypto.randomUUID() }
    composites.value[idx].children.push(sub)
    save('composites')
    return sub
  }

  function updateChild(compositeId: string, childId: string, updates: Partial<Omit<SubServiceConfig, 'id'>>) {
    const c = composites.value.find(c => c.id === compositeId)
    if (!c) return
    const ci = c.children.findIndex(ch => ch.id === childId)
    if (ci === -1) return
    c.children[ci] = { ...c.children[ci], ...updates }
    save('composites')
  }

  function removeChild(compositeId: string, childId: string) {
    const c = composites.value.find(c => c.id === compositeId)
    if (!c) return
    c.children = c.children.filter(ch => ch.id !== childId)
    save('composites')
  }

  function toggleChild(compositeId: string, childId: string) {
    const c = composites.value.find(c => c.id === compositeId)
    const ch = c?.children.find(ch => ch.id === childId)
    if (ch) updateChild(compositeId, childId, { enabled: !ch.enabled })
  }

  return {
    composites: computed(() => composites.value),
    enabledComposites: computed(() => composites.value.filter(c => c.enabled)),
    addComposite, updateComposite, removeComposite, toggleComposite,
    addChild, updateChild, removeChild, toggleChild,
  }
}
