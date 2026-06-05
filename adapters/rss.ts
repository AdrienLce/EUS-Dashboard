import type { AdapterResult, Incident, StatusLevel } from '~/types'

function extractTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  if (!m) return ''
  let content = m[1]
  // Extraire contenu CDATA avant de stripper les tags
  content = content.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  // Stripper les éventuels tags HTML restants
  content = content.replace(/<[^>]+>/g, '')
  return content.trim()
}

function extractAttr(xml: string, tag: string, attr: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*\\s${attr}="([^"]*)"`, 'i'))
  return m ? m[1] : ''
}

function extractAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[\\s>][\\s\\S]*?<\\/${tag}>`, 'gi')
  return xml.match(re) ?? []
}

function guessLevel(text: string): StatusLevel {
  const t = text.toLowerCase()
  if (t.includes('resolved') || t.includes('résolu')) return 'operational'
  if (t.includes('critical') || t.includes('outage') || t.includes('disruption')) return 'majeur'
  if (t.includes('degraded') || t.includes('partial')) return 'mineur'
  if (t.includes('investigating') || t.includes('advisory') || t.includes('warning')) return 'leger'
  if (t.includes('maintenance')) return 'maintenance'
  return 'leger'
}

export interface RssEntry {
  title: string
  summary: string
  updated: string
  link: string
}

export interface RssStructured {
  feed_title: string
  feed_updated: string
  entry_count: number
  entries: RssEntry[]
}

/** Convertit le XML brut en objet navigable pour la prévisualisation et le custom adapter */
export function rssToStructured(raw: string): RssStructured {
  const feedTitle = extractTag(raw, 'title')
  const feedUpdated = extractTag(raw, 'updated') || extractTag(raw, 'lastBuildDate') || ''

  const rawEntries = [
    ...extractAll(raw, 'entry'),
    ...extractAll(raw, 'item'),
  ]

  const entries: RssEntry[] = rawEntries.map((entry) => ({
    title: extractTag(entry, 'title'),
    summary: extractTag(entry, 'summary') || extractTag(entry, 'description') || extractTag(entry, 'content') || '',
    updated: extractTag(entry, 'updated') || extractTag(entry, 'pubDate') || '',
    link: extractAttr(entry, 'link', 'href') || extractTag(entry, 'link') || '',
  }))

  return {
    feed_title: feedTitle,
    feed_updated: feedUpdated,
    entry_count: entries.length,
    entries,
  }
}

export function parseRss(data: unknown): AdapterResult {
  const raw = (data as { _raw?: string })?._raw ?? ''
  if (!raw) return { level: 'operational', message: 'Aucune donnée', incidents: [] }

  const structured = rssToStructured(raw)

  if (structured.entries.length === 0) {
    return { level: 'operational', message: 'Aucun incident en cours', incidents: [] }
  }

  const incidents: Incident[] = structured.entries
    // Filtrer les items "header" sans contenu réel (ex: ICE header générique)
    .filter((entry) => entry.title.length > 0 && (entry.summary.length > 0 || entry.link.length > 0))
    .map((entry, i) => ({
      id: `rss-${i}`,
      title: entry.title,
      level: guessLevel(entry.title + ' ' + entry.summary),
      startedAt: entry.updated,
      updatedAt: entry.updated,
      message: entry.summary || undefined,
      url: entry.link || undefined,
    }))

  const worstLevel = incidents.reduce<StatusLevel>((worst, inc) => {
    const order: StatusLevel[] = ['operational', 'maintenance', 'leger', 'mineur', 'majeur']
    return order.indexOf(inc.level) > order.indexOf(worst) ? inc.level : worst
  }, 'leger')

  return {
    level: worstLevel,
    message: `${incidents.length} entrée(s) dans le flux`,
    incidents,
  }
}
