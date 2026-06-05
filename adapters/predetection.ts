/**
 * Adapter pré-détection — sources communautaires.
 * Détecte les incidents avant qu'ils remontent sur les pages de statut officielles.
 *
 * Sources :
 *  - reddit       : posts récents dans un subreddit (API JSON publique, pas d'auth)
 *  - hn           : HackerNews via Algolia (pas d'auth)
 *  - downdetector : scraping HTML (peut être bloqué par Cloudflare)
 */

import type { PreDetectionConfig } from '~/types'

export interface PreDetectionResult {
  triggered: boolean
  count: number
  source: string
  posts?: string[]
}

// ── Reddit ────────────────────────────────────────────────────

interface RedditChild { data: { title: string; created_utc: number; score: number } }
interface RedditResponse { data: { children: RedditChild[] } }

function parseReddit(data: unknown, keywords: string, threshold: number): PreDetectionResult {
  const kws = keywords.toLowerCase().split(/[\s,]+/).filter(Boolean)
  const children = (data as RedditResponse)?.data?.children ?? []
  const now = Date.now() / 1000
  const recent = children.filter((c) => {
    if (now - (c.data.created_utc ?? 0) > 3600) return false
    const title = c.data.title.toLowerCase()
    return kws.some(k => title.includes(k))
  })
  return { triggered: recent.length >= threshold, count: recent.length, source: 'reddit', posts: recent.slice(0, 3).map(c => c.data.title) }
}

// ── HackerNews Algolia ────────────────────────────────────────

interface HNHit { title: string; created_at_i: number; points?: number }
interface HNResponse { hits: HNHit[] }

function parseHN(data: unknown, threshold: number): PreDetectionResult {
  const hits = (data as HNResponse)?.hits ?? []
  return { triggered: hits.length >= threshold, count: hits.length, source: 'hackernews', posts: hits.slice(0, 3).map(h => h.title) }
}

// ── DownDetector (HTML scraping) ──────────────────────────────

function ddExtractSeries(html: string, key: string): number[] {
  const re = new RegExp(`App\\.dd\\.values\\["${key}"\\]\\s*=\\s*(\\[.*?\\]);`, 's')
  const m = html.match(re)
  if (!m) return []
  try { return (JSON.parse(m[1]) as { y?: number }[]).map(p => p.y ?? 0).filter(v => v > 0) }
  catch { return [] }
}

function ddExtractLatestY(html: string): number {
  const matches = [...html.matchAll(/"y"\s*:\s*(\d+)/g)]
  if (!matches.length) return 0
  const values = matches.slice(-10).map(m => parseInt(m[1], 10)).filter(v => v > 0)
  if (!values.length) return 0
  values.sort((a, b) => a - b)
  return values[Math.floor(values.length / 2)]
}

function ddExtractText(html: string): number {
  const fr = html.match(/(\d+)\s*signalement/i)
  if (fr) return parseInt(fr[1], 10)
  const en = html.match(/(\d+)\s*report/i)
  if (en) return parseInt(en[1], 10)
  const meta = html.match(/content=".*?(\d+).*?signalement/i)
  if (meta) return parseInt(meta[1], 10)
  return 0
}

function parseDownDetector(data: unknown, threshold: number): PreDetectionResult | null {
  const html = (data as { _raw?: string })?._raw ?? ''
  if (!html || html.length < 500) return null

  let current = 0
  let baseline = 0

  const statusSeries = ddExtractSeries(html, 'status-base')
  const baselineSeries = ddExtractSeries(html, 'baseline')

  if (statusSeries.length > 0) {
    current = statusSeries[statusSeries.length - 1]
    baseline = baselineSeries.length > 0 ? baselineSeries[baselineSeries.length - 1] : Math.min(...statusSeries)
  }
  else {
    current = ddExtractLatestY(html)
  }

  if (current === 0) current = ddExtractText(html)
  if (current === 0) return null

  const triggered = (baseline > 0 && current >= baseline * 2.5) || current >= threshold
  return { triggered, count: current, source: 'downdetector' }
}

// ── URL builder ───────────────────────────────────────────────

export function buildPreDetectionUrl(config: PreDetectionConfig): string {
  const kws = config.keywords ?? 'down outage unavailable incident'
  const since = Math.floor(Date.now() / 1000) - 3600

  switch (config.source) {
    case 'reddit':
      return `https://www.reddit.com/r/${encodeURIComponent(config.target)}/search.json?q=${encodeURIComponent(kws)}&sort=new&t=hour&limit=25`
    case 'hn':
      return `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(config.target + ' ' + kws)}&numericFilters=created_at_i%3E${since}`
    case 'downdetector':
      return config.target
    default:
      return ''
  }
}

// ── Parser principal ──────────────────────────────────────────

export function parsePreDetection(
  source: PreDetectionConfig['source'],
  data: unknown,
  config: PreDetectionConfig,
): PreDetectionResult | null {
  const kws = config.keywords ?? 'down outage unavailable incident'
  const threshold = config.threshold ?? (source === 'downdetector' ? 100 : 3)

  switch (source) {
    case 'reddit':      return parseReddit(data, kws, threshold)
    case 'hn':          return parseHN(data, threshold)
    case 'downdetector': return parseDownDetector(data, threshold)
    default:            return null
  }
}
