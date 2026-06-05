const compact = ref(false)

export function useDisplayMode() {
  if (import.meta.client) {
    compact.value = localStorage.getItem('status-display-compact') === '1'
  }

  function toggle() {
    compact.value = !compact.value
    if (import.meta.client) localStorage.setItem('status-display-compact', compact.value ? '1' : '0')
  }

  return { compact, toggle }
}
