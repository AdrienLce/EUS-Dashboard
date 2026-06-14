/**
 * @module composables/useLevelConfig
 *
 * Manages the status level configuration (customizable colors and labels).
 *
 * ## What the user can customize
 *
 * For each level (operational, leger, mineur, majeur, maintenance, information, inconnu),
 * the user can modify:
 * - `label`: name shown in the UI (e.g. "Panne totale" instead of "Incident majeur")
 * - `color`: hexadecimal color for the badges and indicators
 *
 * The `reference` field is immutable and recalls the level's original semantics.
 *
 * ## Persistence
 *
 * The level configuration is stored:
 * 1. In localStorage (read immediately when the page loads)
 * 2. On the server via POST /api/config (async sync)
 *
 * On load, localStorage is used immediately (avoids a flash with the default
 * colors), then synchronized with the server if it has data.
 *
 * ## Module-level state (singleton)
 *
 * `levels` and `loaded` are shared across all instances of the composable.
 */

import type { StatusLevel, LevelConfig } from '~/types'
import { DEFAULT_LEVEL_CONFIGS } from '~/types'

/** localStorage key for the level configuration */
const LS_KEY = 'status-dashboard-levels'

/** Reactive list of level configurations */
const levels = ref<LevelConfig[]>([])
/** true once load() has finished */
const loaded = ref(false)

/**
 * Loads the level configuration from localStorage, then synchronizes it
 * with the server.
 *
 * The priority order is reversed compared to useServerConfig here:
 * - localStorage is read FIRST (synchronous) to avoid a visual flash
 * - The server is queried afterward (asynchronous) and overwrites localStorage if
 *   server data exists (the server is the source of truth)
 */
function load() {
  if (!import.meta.client) return
  try {
    const raw = localStorage.getItem(LS_KEY)
    // Read localStorage immediately for the initial render
    levels.value = raw ? JSON.parse(raw) : [...DEFAULT_LEVEL_CONFIGS]
  }
  catch { levels.value = [...DEFAULT_LEVEL_CONFIGS] }

  // Asynchronous synchronization with the server (best-effort)
  $fetch<{ levels?: LevelConfig[] }>('/api/config').then((data) => {
    if (data.levels?.length) levels.value = data.levels
  }).catch(() => {})

  loaded.value = true
}

/**
 * Saves the level configuration to localStorage and to the server.
 * Called after each change (updateLabel, updateColor, reset).
 */
function save() {
  if (!import.meta.client) return
  localStorage.setItem(LS_KEY, JSON.stringify(levels.value))
  $fetch('/api/config', { method: 'POST', body: { levels: levels.value } }).catch(() => {})
}

/**
 * Returns the configuration of a specific level.
 * Falls back to DEFAULT_LEVEL_CONFIGS if the level is not found
 * in the custom configuration (should not happen in practice).
 *
 * @param id - Level identifier
 * @returns LevelConfig with the customized colors and labels
 */
function getConfig(id: StatusLevel): LevelConfig {
  return levels.value.find(l => l.id === id) ?? DEFAULT_LEVEL_CONFIGS.find(l => l.id === id)!
}

/**
 * Converts a hexadecimal color (#rrggbb) into RGB components.
 * Used internally by levelStyles to compute the color variants.
 *
 * @param hex - Color in "#rrggbb" format (with or without #)
 * @returns Object { r, g, b } with integers 0-255
 *
 * @example
 * hexToRgb('#22c55e') // → { r: 34, g: 197, b: 94 }
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  }
}

/**
 * Generates a set of inline CSS styles for the different display contexts
 * of a level, based on its hexadecimal color.
 *
 * Returns 4 style variants:
 * - `badge`  : very light background (10% opacity), darkened text (70%), subtle border (25%)
 * - `dot`    : solid colored circle (status indicator)
 * - `border` : colored border for cards/panels (35% opacity)
 * - `banner` : solid colored background with white text (for alerts and banners)
 *
 * @param hex - Hexadecimal color (e.g. "#ef4444")
 * @returns Object with the styles for each variant
 *
 * @example
 * const styles = levelStyles('#ef4444')
 * // styles.badge  → { backgroundColor: 'rgba(239,68,68,0.10)', color: '...', borderColor: '...' }
 * // styles.banner → { backgroundColor: 'rgb(239,68,68)', color: '#fff' }
 *
 * // Usage in a Vue template:
 * // <div :style="styles.badge">Incident majeur</div>
 */
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

/**
 * Composable exposing the level configuration with persistence.
 *
 * @example
 * const { levels, getConfig, levelStyles, save, reset } = useLevelConfig()
 *
 * // Get the styles for a level
 * const config = getConfig('majeur')
 * const styles = levelStyles(config.color)
 *
 * // Change a level's label
 * const idx = levels.value.findIndex(l => l.id === 'majeur')
 * levels.value[idx].label = 'Panne critique'
 * save()
 *
 * // Restore the default values
 * reset()
 */
export function useLevelConfig() {
  if (import.meta.client && !loaded.value) load()
  return {
    /** Reactive list of the 7 level configurations */
    levels,
    /** Returns the LevelConfig of a specific level */
    getConfig,
    /** Generates the CSS styles for a hex color */
    levelStyles,
    /** Saves the current configuration */
    save,
    /** Resets all levels to their default values and saves */
    reset: () => { levels.value = [...DEFAULT_LEVEL_CONFIGS]; save() },
  }
}
