import { useServerConfig } from './useServerConfig'

export function useOrdering() {
  const { order, save } = useServerConfig()

  function setOrder(ids: string[]) {
    order.value = ids
    save('order')
  }

  function sortItems<T extends { id: string }>(items: T[]): T[] {
    if (!order.value.length) return items
    const indexed = new Map(order.value.map((id, i) => [id, i]))
    return [...items].sort((a, b) => {
      const ia = indexed.get(a.id) ?? Infinity
      const ib = indexed.get(b.id) ?? Infinity
      return ia - ib
    })
  }

  return { order, setOrder, sortItems }
}
