import { useServerConfig } from './useServerConfig'

export type Theme = 'light' | 'dark'

const THEMES: { value: Theme; label: string; description: string }[] = [
  { value: 'light', label: 'Clair',  description: 'Fond blanc, texte sombre' },
  { value: 'dark',  label: 'Sombre', description: 'Fond anthracite, texte clair' },
]

function applyTheme(t: string) {
  if (!import.meta.client) return
  document.documentElement.setAttribute('data-theme', t)
}

// Watch module-level unique — créé une seule fois, pas à chaque appel du composable
let watchInitialized = false

export function useTheme() {
  const { theme, save } = useServerConfig()

  if (import.meta.client && !watchInitialized) {
    watchInitialized = true
    watch(theme, (t) => applyTheme(t), { immediate: true })
  }

  function setTheme(t: Theme) {
    theme.value = t
    applyTheme(t)
    save('theme')
  }

  return { theme: theme as import('vue').Ref<Theme>, themes: THEMES, setTheme }
}
