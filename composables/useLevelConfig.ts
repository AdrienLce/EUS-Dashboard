import type { StatusLevel, LevelConfig } from '~/types'
import { DEFAULT_LEVEL_CONFIGS } from '~/types'

const LS_KEY = 'status-dashboard-levels'
const levels = ref<LevelConfig[]>([])
const loaded = ref(false)

function load() {
  if (!import.meta.client) return
  try {
    const raw = localStorage.getItem(LS_KEY)
    levels.value = raw ? JSON.parse(raw) : [...DEFAULT_LEVEL_CONFIGS]
  }
  catch { levels.value = [...DEFAULT_LEVEL_CONFIGS] }
  // Sync avec serveur
  $fetch<{ levels?: LevelConfig[] }>('/api/config').then((data) => {
    if (data.levels?.length) levels.value = data.levels
  }).catch(() => {})
  loaded.value = true
}

function save() {
  if (!import.meta.client) return
  localStorage.setItem(LS_KEY, JSON.stringify(levels.value))
  $fetch('/api/config', { method: 'POST', body: { levels: levels.value } }).catch(() => {})
}

function getConfig(id: StatusLevel): LevelConfig {
  return levels.value.find(l => l.id === id) ?? DEFAULT_LEVEL_CONFIGS.find(l => l.id === id)!
}

/** Convertit #rrggbb en { r, g, b } */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  }
}

/** Styles inline CSS pour un badge à partir d'une couleur hex */
export function levelStyles(hex: string) {
  const { r, g, b } = hexToRgb(hex)
  return {
    badge: {
      backgroundColor: `rgba(${r},${g},${b},0.10)`,
      color: `rgb(${Math.round(r * 0.7)},${Math.round(g * 0.7)},${Math.round(b * 0.7)})`,
      borderColor: `rgba(${r},${g},${b},0.25)`,
    },
    dot: { backgroundColor: `rgb(${r},${g},${b})` },
    border: { borderColor: `rgba(${r},${g},${b},0.35)` },
    banner: { backgroundColor: `rgb(${r},${g},${b})`, color: '#fff' },
  }
}

export function useLevelConfig() {
  if (import.meta.client && !loaded.value) load()
  return {
    levels,
    getConfig,
    levelStyles,
    save,
    reset: () => { levels.value = [...DEFAULT_LEVEL_CONFIGS]; save() },
  }
}
