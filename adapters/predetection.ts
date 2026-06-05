/**
 * @module adapters/predetection
 *
 * Adapter de pré-détection communautaire d'incidents.
 *
 * Ce module interroge des sources tierces pour détecter les incidents
 * AVANT qu'ils remontent sur les pages de statut officielles.
 * La pré-détection ne se déclenche que si le statut officiel est déjà `operational`.
 *
 * Sources supportées :
 *  - `reddit`      : posts récents dans un subreddit (API JSON publique, sans auth)
 *  - `hn`          : articles HackerNews via l'API Algolia (sans auth)
 *  - `downdetector`: scraping HTML de DownDetector (peut être bloqué par Cloudflare)
 *
 * Flux de données :
 * 1. `buildPreDetectionUrl` génère l'URL à appeler selon la source configurée
 * 2. Le proxy Nitro récupère la réponse (JSON ou HTML brut)
 * 3. `parsePreDetection` analyse la réponse et retourne un PreDetectionResult
 * 4. Si `result.triggered === true`, le snapshot reçoit `preDetected: true`
 */

import type { PreDetectionConfig } from '~/types'

/**
 * Résultat de l'analyse d'une source de pré-détection.
 */
export interface PreDetectionResult {
  /** true si le seuil de déclenchement est atteint */
  triggered: boolean
  /** Nombre de signalements/posts trouvés */
  count: number
  /** Nom de la source ('reddit', 'hackernews', 'downdetector') */
  source: string
  /** Titres des 3 premiers posts (Reddit/HN uniquement) */
  posts?: string[]
}

// ── Reddit ────────────────────────────────────────────────────────────────────
//
// L'API JSON publique de Reddit (reddit.com/r/{subreddit}/search.json) retourne
// les posts récents filtrés par mots-clés dans un subreddit donné.
// Pas d'authentification requise, mais un User-Agent personnalisé est nécessaire
// pour éviter les blocages automatiques.

/** Structure minimale d'un post Reddit dans la réponse API */
interface RedditChild { data: { title: string; created_utc: number; score: number } }
/** Structure de la réponse API Reddit */
interface RedditResponse { data: { children: RedditChild[] } }

/**
 * Parse une réponse de l'API Reddit et détecte les posts signalant un incident.
 *
 * Critères de filtrage :
 * - Post publié dans la dernière heure (created_utc > now - 3600s)
 * - Titre contient au moins un des mots-clés configurés
 *
 * @param data      - Réponse brute de l'API Reddit
 * @param keywords  - Mots-clés séparés par espaces ou virgules
 * @param threshold - Nombre minimum de posts pour déclencher l'alerte
 */
function parseReddit(data: unknown, keywords: string, threshold: number): PreDetectionResult {
  const kws = keywords.toLowerCase().split(/[\s,]+/).filter(Boolean)
  const children = (data as RedditResponse)?.data?.children ?? []
  const now = Date.now() / 1000

  const recent = children.filter((c) => {
    // Filtrer par ancienneté (dernière heure uniquement)
    if (now - (c.data.created_utc ?? 0) > 3600) return false
    // Filtrer par mots-clés dans le titre
    const title = c.data.title.toLowerCase()
    return kws.some(k => title.includes(k))
  })

  return {
    triggered: recent.length >= threshold,
    count: recent.length,
    source: 'reddit',
    posts: recent.slice(0, 3).map(c => c.data.title),
  }
}

// ── HackerNews (via Algolia) ──────────────────────────────────────────────────
//
// L'API Algolia de HackerNews (hn.algolia.com/api/v1/search) permet de chercher
// des articles récents par mot-clé avec filtre temporel.
// L'URL construite inclut déjà le nom du service ET les mots-clés d'incident,
// et filtre sur les articles publiés dans la dernière heure.

/** Structure minimale d'un article HN dans la réponse Algolia */
interface HNHit { title: string; created_at_i: number; points?: number }
/** Structure de la réponse API Algolia HN */
interface HNResponse { hits: HNHit[] }

/**
 * Parse une réponse de l'API Algolia HackerNews.
 * Le filtrage temporel et par mots-clés est déjà appliqué dans l'URL (buildPreDetectionUrl),
 * donc on compte simplement les hits retournés.
 *
 * @param data      - Réponse brute de l'API Algolia
 * @param threshold - Nombre minimum d'articles pour déclencher l'alerte
 */
function parseHN(data: unknown, threshold: number): PreDetectionResult {
  const hits = (data as HNResponse)?.hits ?? []
  return {
    triggered: hits.length >= threshold,
    count: hits.length,
    source: 'hackernews',
    posts: hits.slice(0, 3).map(h => h.title),
  }
}

// ── DownDetector (scraping HTML) ──────────────────────────────────────────────
//
// DownDetector n'a pas d'API publique. On scrape le HTML de la page de statut
// d'un service. Le HTML contient des séries de données JavaScript injectées
// par l'application (App.dd.values["status-base"] = [...]) ainsi que des textes
// décrivant le nombre de signalements.
//
// Stratégies d'extraction du nombre de signalements actuels :
// 1. Série "status-base" : données de la courbe de signalements (valeur la plus récente)
// 2. Valeurs "y" dans le HTML : médiane des 10 dernières valeurs positives
// 3. Regex sur le texte : "X signalement(s)" ou "X report(s)"

/**
 * Extrait une série de données numérique depuis le JavaScript injecté dans le HTML
 * de DownDetector (format: `App.dd.values["key"] = [{y: N}, ...];`).
 *
 * @param html - HTML brut de la page DownDetector
 * @param key  - Clé de la série (ex: "status-base", "baseline")
 * @returns Tableau des valeurs y (positives uniquement)
 */
function ddExtractSeries(html: string, key: string): number[] {
  const re = new RegExp(`App\\.dd\\.values\\["${key}"\\]\\s*=\\s*(\\[.*?\\]);`, 's')
  const m = html.match(re)
  if (!m) return []
  try { return (JSON.parse(m[1]) as { y?: number }[]).map(p => p.y ?? 0).filter(v => v > 0) }
  catch { return [] }
}

/**
 * Méthode de fallback : extrait la médiane des 10 dernières valeurs "y"
 * trouvées dans le HTML (si les séries nommées ne sont pas disponibles).
 * La médiane est plus robuste que la max pour éviter les pics isolés.
 *
 * @param html - HTML brut de la page DownDetector
 * @returns Valeur médiane estimée des signalements
 */
function ddExtractLatestY(html: string): number {
  const matches = [...html.matchAll(/"y"\s*:\s*(\d+)/g)]
  if (!matches.length) return 0
  const values = matches.slice(-10).map(m => parseInt(m[1], 10)).filter(v => v > 0)
  if (!values.length) return 0
  values.sort((a, b) => a - b)
  return values[Math.floor(values.length / 2)]
}

/**
 * Méthode de dernier recours : cherche un texte du type "X signalements" ou
 * "X reports" dans le HTML (texte visible de la page).
 *
 * @param html - HTML brut de la page DownDetector
 * @returns Nombre trouvé dans le texte, ou 0
 */
function ddExtractText(html: string): number {
  const fr = html.match(/(\d+)\s*signalement/i)
  if (fr) return parseInt(fr[1], 10)
  const en = html.match(/(\d+)\s*report/i)
  if (en) return parseInt(en[1], 10)
  const meta = html.match(/content=".*?(\d+).*?signalement/i)
  if (meta) return parseInt(meta[1], 10)
  return 0
}

/**
 * Parse le HTML brut d'une page DownDetector pour extraire le nombre de signalements
 * et déterminer si le seuil d'alerte est atteint.
 *
 * Logique de déclenchement :
 * - Si une baseline est disponible : déclenche si `current >= baseline * 2.5` (2,5x la normale)
 * - Sinon : déclenche si `current >= threshold` (seuil absolu)
 *
 * Retourne null si le HTML est trop court ou si aucune valeur n'est trouvée
 * (probablement bloqué par Cloudflare).
 *
 * @param data      - Réponse du proxy (doit contenir `_raw` avec le HTML)
 * @param threshold - Nombre absolu de signalements pour déclencher l'alerte
 */
function parseDownDetector(data: unknown, threshold: number): PreDetectionResult | null {
  const html = (data as { _raw?: string })?._raw ?? ''
  // Vérification minimale : une page HTML valide fait au moins 500 caractères
  if (!html || html.length < 500) return null

  let current = 0
  let baseline = 0

  // Stratégie 1 : séries JavaScript nommées (la plus fiable)
  const statusSeries = ddExtractSeries(html, 'status-base')
  const baselineSeries = ddExtractSeries(html, 'baseline')

  if (statusSeries.length > 0) {
    // Prendre la dernière valeur de la série comme valeur courante
    current = statusSeries[statusSeries.length - 1]
    // Baseline = dernière valeur de la série baseline, ou minimum de status-base
    baseline = baselineSeries.length > 0 ? baselineSeries[baselineSeries.length - 1] : Math.min(...statusSeries)
  }
  else {
    // Stratégie 2 : médiane des dernières valeurs "y"
    current = ddExtractLatestY(html)
  }

  // Stratégie 3 : regex sur le texte visible
  if (current === 0) current = ddExtractText(html)
  if (current === 0) return null

  // Déclencher si : 2,5x la baseline OU au-dessus du seuil absolu
  const triggered = (baseline > 0 && current >= baseline * 2.5) || current >= threshold
  return { triggered, count: current, source: 'downdetector' }
}

// ── Constructeur d'URL ────────────────────────────────────────────────────────

/**
 * Construit l'URL à appeler pour une source de pré-détection donnée.
 *
 * - Reddit : search dans /r/{subreddit} avec mots-clés, trié par nouveauté, limité à 1h
 * - HN     : recherche Algolia avec service+mots-clés, filtré sur la dernière heure
 * - DownDetector : retourne directement l'URL cible (c'est l'URL de la page à scraper)
 *
 * @param config - Configuration de la pré-détection
 * @returns URL complète à passer au proxy, ou '' si la source est inconnue
 *
 * @example
 * buildPreDetectionUrl({ source: 'reddit', target: 'github', keywords: 'down outage', threshold: 3, enabled: true })
 * // → "https://www.reddit.com/r/github/search.json?q=down+outage&sort=new&t=hour&limit=25"
 *
 * @example
 * buildPreDetectionUrl({ source: 'hn', target: 'GitHub', keywords: 'down', threshold: 3, enabled: true })
 * // → "https://hn.algolia.com/api/v1/search?query=GitHub+down&numericFilters=created_at_i%3E{timestamp}"
 */
export function buildPreDetectionUrl(config: PreDetectionConfig): string {
  const kws = config.keywords ?? 'down outage unavailable incident'
  // Filtre temporel HN : articles créés dans la dernière heure
  const since = Math.floor(Date.now() / 1000) - 3600

  switch (config.source) {
    case 'reddit':
      // /r/{subreddit}/search.json?q=...&sort=new&t=hour : posts de la dernière heure
      return `https://www.reddit.com/r/${encodeURIComponent(config.target)}/search.json?q=${encodeURIComponent(kws)}&sort=new&t=hour&limit=25`
    case 'hn':
      // Algolia HN : recherche "{service} {keywords}" avec filtre created_at > il y a 1h
      return `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(config.target + ' ' + kws)}&numericFilters=created_at_i%3E${since}`
    case 'downdetector':
      // Pour DownDetector, la target est directement l'URL complète de la page
      return config.target
    default:
      return ''
  }
}

// ── Parser principal ──────────────────────────────────────────────────────────

/**
 * Analyse une réponse de source de pré-détection et retourne le résultat.
 *
 * Point d'entrée principal appelé depuis usePolling après récupération via le proxy.
 *
 * @param source - Type de source ('reddit', 'hn', 'downdetector')
 * @param data   - Données brutes retournées par le proxy
 * @param config - Configuration complète (pour accéder aux keywords et threshold)
 * @returns PreDetectionResult si la source est reconnue, null sinon
 *
 * @example
 * const result = parsePreDetection('reddit', redditApiResponse, { threshold: 5, keywords: 'down', ... })
 * if (result?.triggered) {
 *   snapshot.preDetected = true
 *   snapshot.preDetectedCount = result.count
 * }
 */
export function parsePreDetection(
  source: PreDetectionConfig['source'],
  data: unknown,
  config: PreDetectionConfig,
): PreDetectionResult | null {
  const kws = config.keywords ?? 'down outage unavailable incident'
  // Seuils par défaut différenciés selon la source
  const threshold = config.threshold ?? (source === 'downdetector' ? 100 : 3)

  switch (source) {
    case 'reddit':       return parseReddit(data, kws, threshold)
    case 'hn':           return parseHN(data, threshold)
    case 'downdetector': return parseDownDetector(data, threshold)
    default:             return null
  }
}
