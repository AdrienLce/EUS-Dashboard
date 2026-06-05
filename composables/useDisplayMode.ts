import { useServerConfig } from './useServerConfig'

export type PageStyle = 'box' | 'large'

const compact = ref(false)

function loadCompact() {
  if (!import.meta.client) return
  compact.value = localStorage.getItem('status-display-compact') === '1'
}

export function useDisplayMode() {
  if (import.meta.client) loadCompact()

  const { pageStyle, save } = useServerConfig()

  function toggle() {
    compact.value = !compact.value
    if (import.meta.client) localStorage.setItem('status-display-compact', compact.value ? '1' : '0')
  }

  function setPageStyle(s: PageStyle) {
    pageStyle.value = s
    save('pageStyle')
  }

  return {
    compact,
    toggle,
    pageStyle: pageStyle as import('vue').Ref<PageStyle>,
    setPageStyle,
  }
}
