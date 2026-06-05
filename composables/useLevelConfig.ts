/**
 * @module composables/useLevelConfig
 *
 * Gestion de la configuration des niveaux de statut (couleurs et libellés personnalisables).
 *
 * ## Ce que l'utilisateur peut personnaliser
 *
 * Pour chaque niveau (operational, leger, mineur, majeur, maintenance, information, inconnu),
 * l'utilisateur peut modifier :
 * - `label` : nom affiché dans l'UI (ex: "Panne totale" au lieu de "Incident majeur")
 * - `color` : couleur hexadécimale pour les badges et indicateurs
 *
 * Le champ `reference` est immuable et rappelle la sémantique originale du niveau.
 *
 * ## Persistance
 *
 * La configuration des niveaux est stockée :
 * 1. Dans localStorage (lecture immédiate au chargement de la page)
 * 2. Sur le serveur via POST /api/config (sync async)
 *
 * Au chargement, localStorage est utilisé immédiatement (évite un flash avec les
 * couleurs par défaut), puis synchronisé avec le serveur si celui-ci a des données.
 *
 * ## État module-level (singleton)
 *
 * `levels` et `loaded` sont partagés entre toutes les instances du composable.
 */

import type { StatusLevel, LevelConfig } from '~/types'
import { DEFAULT_LEVEL_CONFIGS } from '~/types'

/** Clé localStorage pour la configuration des niveaux */
const LS_KEY = 'status-dashboard-levels'

/** Liste réactive des configurations de niveaux */
const levels = ref<LevelConfig[]>([])
/** true une fois que load() a terminé */
const loaded = ref(false)

/**
 * Charge la configuration des niveaux depuis localStorage puis la synchronise
 * avec le serveur.
 *
 * L'ordre de priorité est inverse à useServerConfig ici :
 * - localStorage est lu EN PREMIER (synchrone) pour éviter un flash visuel
 * - Le serveur est consulté ensuite (asynchrone) et écrase localStorage si des
 *   données serveur existent (le serveur est la source de vérité)
 */
function load() {
  if (!import.meta.client) return
  try {
    const raw = localStorage.getItem(LS_KEY)
    // Lire localStorage immédiatement pour l'affichage initial
    levels.value = raw ? JSON.parse(raw) : [...DEFAULT_LEVEL_CONFIGS]
  }
  catch { levels.value = [...DEFAULT_LEVEL_CONFIGS] }

  // Synchronisation asynchrone avec le serveur (best-effort)
  $fetch<{ levels?: LevelConfig[] }>('/api/config').then((data) => {
    if (data.levels?.length) levels.value = data.levels
  }).catch(() => {})

  loaded.value = true
}

/**
 * Sauvegarde la configuration des niveaux dans localStorage et sur le serveur.
 * Appelée après chaque modification (updateLabel, updateColor, reset).
 */
function save() {
  if (!import.meta.client) return
  localStorage.setItem(LS_KEY, JSON.stringify(levels.value))
  $fetch('/api/config', { method: 'POST', body: { levels: levels.value } }).catch(() => {})
}

/**
 * Retourne la configuration d'un niveau spécifique.
 * Utilise les DEFAULT_LEVEL_CONFIGS comme fallback si le niveau n'est pas trouvé
 * dans la configuration personnalisée (ne devrait pas arriver en pratique).
 *
 * @param id - Identifiant du niveau
 * @returns LevelConfig avec les couleurs et libellés personnalisés
 */
function getConfig(id: StatusLevel): LevelConfig {
  return levels.value.find(l => l.id === id) ?? DEFAULT_LEVEL_CONFIGS.find(l => l.id === id)!
}

/**
 * Convertit une couleur hexadécimale (#rrggbb) en composantes RGB.
 * Utilisé en interne par levelStyles pour calculer les variantes de couleur.
 *
 * @param hex - Couleur au format "#rrggbb" (avec ou sans #)
 * @returns Objet { r, g, b } avec des entiers 0-255
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
 * Génère un jeu de styles CSS inline pour les différents contextes d'affichage
 * d'un niveau, à partir de sa couleur hexadécimale.
 *
 * Retourne 4 variantes de style :
 * - `badge`  : fond très léger (10% opacité), texte assombri (70%), bordure subtile (25%)
 * - `dot`    : cercle coloré plein (indicateur de statut)
 * - `border` : bordure colorée pour les cartes/panneaux (35% opacité)
 * - `banner` : fond coloré plein avec texte blanc (pour les alertes et bandeaux)
 *
 * @param hex - Couleur hexadécimale (ex: "#ef4444")
 * @returns Objet avec les styles pour chaque variante
 *
 * @example
 * const styles = levelStyles('#ef4444')
 * // styles.badge  → { backgroundColor: 'rgba(239,68,68,0.10)', color: '...', borderColor: '...' }
 * // styles.banner → { backgroundColor: 'rgb(239,68,68)', color: '#fff' }
 *
 * // Usage dans un template Vue :
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
 * Composable exposant la configuration des niveaux avec persistance.
 *
 * @example
 * const { levels, getConfig, levelStyles, save, reset } = useLevelConfig()
 *
 * // Obtenir les styles pour un niveau
 * const config = getConfig('majeur')
 * const styles = levelStyles(config.color)
 *
 * // Modifier le libellé d'un niveau
 * const idx = levels.value.findIndex(l => l.id === 'majeur')
 * levels.value[idx].label = 'Panne critique'
 * save()
 *
 * // Remettre les valeurs par défaut
 * reset()
 */
export function useLevelConfig() {
  if (import.meta.client && !loaded.value) load()
  return {
    /** Liste réactive des 7 configurations de niveaux */
    levels,
    /** Retourne la LevelConfig d'un niveau spécifique */
    getConfig,
    /** Génère les styles CSS pour une couleur hex */
    levelStyles,
    /** Sauvegarde la configuration actuelle */
    save,
    /** Remet tous les niveaux à leurs valeurs par défaut et sauvegarde */
    reset: () => { levels.value = [...DEFAULT_LEVEL_CONFIGS]; save() },
  }
}
