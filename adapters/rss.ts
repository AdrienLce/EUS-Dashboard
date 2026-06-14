/**
 * @module adapters/rss
 *
 * Adapter for RSS 2.0 and Atom 1.0 feeds.
 *
 * The Nitro proxy returns the raw XML content wrapped in `{ _raw: "<xml>..." }`
 * because it cannot parse the "application/xml" Content-Type as JSON.
 *
 * This module exposes two functions:
 * - `rssToStructured`: converts the raw XML into a navigable JSON object (RssStructured).
 *   Used both by parseRss AND by the custom adapter (to allow mapping
 *   over RSS feeds via paths such as `entries.*.title`).
 * - `parseRss`: a complete adapter that transforms an RSS feed into an AdapterResult.
 *
 * Compatibility:
 * - RSS 2.0  : `<item>`, `<title>`, `<description>`, `<pubDate>`, `<link>` tags
 * - Atom 1.0 : `<entry>`, `<title>`, `<summary>`, `<updated>`, `<link href="...">` tags
 * - CDATA    : the CDATA content is extracted before HTML stripping
 *
 * Level detection:
 * The level is inferred heuristically from each entry's title and summary.
 * There is no standardized "impact" field in RSS/Atom.
 */

import type { AdapterResult, Incident, StatusLevel } from '~/types'

/**
 * Extracts the text content of an XML tag (first occurrence).
 * Handles CDATA and strips residual HTML tags.
 *
 * @param xml - XML fragment to analyze
 * @param tag - Tag name (e.g. "title", "summary")
 * @returns Cleaned text content, or '' if the tag is absent
 */
function extractTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  if (!m) return ''
  let content = m[1]
  // Extract the CDATA content before stripping the tags
  content = content.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  // Remove any remaining HTML tags
  content = content.replace(/<[^>]+>/g, '')
  return content.trim()
}

/**
 * Extracts the value of an attribute from an XML tag.
 * Used for `<link href="...">` in Atom (unlike RSS where link is a text element).
 *
 * @param xml  - XML fragment to analyze
 * @param tag  - Tag name
 * @param attr - Attribute name
 * @returns The attribute value, or '' if absent
 */
function extractAttr(xml: string, tag: string, attr: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*\\s${attr}="([^"]*)"`, 'i'))
  return m ? m[1] : ''
}

/**
 * Extracts all XML fragments matching a tag (all occurrences).
 * Used to iterate over `<entry>` (Atom) and `<item>` (RSS).
 *
 * @param xml - Full XML of the feed
 * @param tag - Name of the tag to extract
 * @returns Array of XML fragments (one per occurrence)
 */
function extractAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[\\s>][\\s\\S]*?<\\/${tag}>`, 'gi')
  return xml.match(re) ?? []
}

/**
 * Heuristically detects a StatusLevel from the text of an RSS/Atom entry.
 * Analyzes the title AND summary combined for better accuracy.
 *
 * @param text - Combined text (title + ' ' + summary)
 * @returns The inferred StatusLevel, or 'leger' by default (conservative for a feed)
 */
function guessLevel(text: string): StatusLevel {
  const t = text.toLowerCase()
  if (t.includes('resolved') || t.includes('résolu')) return 'operational'
  if (t.includes('critical') || t.includes('outage') || t.includes('disruption')) return 'majeur'
  if (t.includes('degraded') || t.includes('partial')) return 'mineur'
  if (t.includes('investigating') || t.includes('advisory') || t.includes('warning')) return 'leger'
  if (t.includes('maintenance')) return 'maintenance'
  // Default: minor disruption (we are in an incident feed, not a normal-status feed)
  return 'leger'
}

/**
 * Representation of a normalized entry from RSS/Atom.
 * Fields common to both formats after normalization.
 */
export interface RssEntry {
  /** Entry title (title tag) */
  title: string
  /** Summary/description (summary, description or content) */
  summary: string
  /** Update or publication date (updated or pubDate) */
  updated: string
  /** Entry URL (href of an Atom link or text of an RSS link) */
  link: string
}

/**
 * Navigable JSON structure generated from a raw RSS/Atom feed.
 * Allows using the custom adapter's paths (e.g. `entries.*.title`).
 */
export interface RssStructured {
  /** Feed title (first title tag of the channel) */
  feed_title: string
  /** Feed last-updated date (updated or lastBuildDate) */
  feed_updated: string
  /** Total number of entries in the feed */
  entry_count: number
  /** Normalized entries (Atom entry + RSS item merged) */
  entries: RssEntry[]
}

/**
 * Converts a raw RSS/Atom XML feed into a structured, navigable JSON object.
 *
 * This function is used in two places:
 * 1. By `parseRss` to generate incidents automatically
 * 2. By `resolveData` in custom.ts to enable custom mapping
 *    (the generated JSON tree is the one visible in the UI explorer)
 *
 * Compatibility:
 * - Atom 1.0 : extracts the `<entry>` tags
 * - RSS 2.0  : extracts the `<item>` tags
 * - Both coexist if present (unlikely but supported)
 *
 * @param raw - Raw XML content of the feed (from `{ _raw: "..." }`)
 * @returns An RssStructured object with the normalized entries
 *
 * @example
 * // After calling, the result is navigable by the custom adapter:
 * // entries.*.title    → titles of all entries
 * // entries.*.summary  → summaries of all entries
 * // entries.0.link     → link of the first entry
 * const structured = rssToStructured(xmlString)
 * // → { feed_title: "...", entry_count: 5, entries: [...] }
 */
export function rssToStructured(raw: string): RssStructured {
  const feedTitle = extractTag(raw, 'title')
  const feedUpdated = extractTag(raw, 'updated') || extractTag(raw, 'lastBuildDate') || ''

  // Combine Atom entries and RSS items (rare case but supported)
  const rawEntries = [
    ...extractAll(raw, 'entry'),  // Atom 1.0
    ...extractAll(raw, 'item'),   // RSS 2.0
  ]

  const entries: RssEntry[] = rawEntries.map((entry) => ({
    title: extractTag(entry, 'title'),
    // Try summary (Atom), description (RSS), then content as a last resort
    summary: extractTag(entry, 'summary') || extractTag(entry, 'description') || extractTag(entry, 'content') || '',
    // Try updated (Atom) then pubDate (RSS)
    updated: extractTag(entry, 'updated') || extractTag(entry, 'pubDate') || '',
    // Try the href attribute (Atom) then the tag text (RSS)
    link: extractAttr(entry, 'link', 'href') || extractTag(entry, 'link') || '',
  }))

  return {
    feed_title: feedTitle,
    feed_updated: feedUpdated,
    entry_count: entries.length,
    entries,
  }
}

/**
 * Parses a raw RSS/Atom feed into an AdapterResult.
 *
 * The presence of entries is interpreted as a sign of an incident (status RSS
 * feeds generally publish entries only when there are problems).
 *
 * Filtering: entries with neither title nor content (e.g. generic "header" elements
 * inserted by some services) are ignored.
 *
 * @param data - Proxy response containing `{ _raw: "<xml>..." }`
 * @returns AdapterResult with the most severe level among the entries
 */
export function parseRss(data: unknown): AdapterResult {
  const raw = (data as { _raw?: string })?._raw ?? ''
  if (!raw) return { level: 'operational', message: 'Aucune donnée', incidents: [] }

  const structured = rssToStructured(raw)

  if (structured.entries.length === 0) {
    return { level: 'operational', message: 'Aucun incident en cours', incidents: [] }
  }

  const incidents: Incident[] = structured.entries
    // Filter out "header" items with no real content (e.g. generic ICE header)
    .filter((entry) => entry.title.length > 0 && (entry.summary.length > 0 || entry.link.length > 0))
    .map((entry, i) => ({
      id: `rss-${i}`,
      title: entry.title,
      // Analyze the title AND summary together for better detection
      level: guessLevel(entry.title + ' ' + entry.summary),
      startedAt: entry.updated,
      updatedAt: entry.updated,
      message: entry.summary || undefined,
      url: entry.link || undefined,
    }))

  // The global level is the worst level among all entries in the feed
  const worstLevel = incidents.reduce<StatusLevel>((worst, inc) => {
    const order: StatusLevel[] = ['operational', 'maintenance', 'leger', 'mineur', 'majeur']
    return order.indexOf(inc.level) > order.indexOf(worst) ? inc.level : worst
  }, 'leger') // Default 'leger': a non-empty feed is at minimum a minor disruption

  return {
    level: worstLevel,
    message: `${incidents.length} entrée(s) dans le flux`,
    incidents,
  }
}
