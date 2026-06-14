/**
 * @module utils/summarize
 *
 * Generation of a readable text summary from a list of incidents or entries.
 *
 * This module is used in the UI to display a condensed overview of the contents
 * of a composite service or an RSS feed (e.g. "3 incidents · 2 maintenances planifiées").
 *
 * It produces two pieces of information:
 * - `text`      : sentence describing the breakdown by category
 * - `dateRange` : date range covered by the entries
 */

import type { Incident, MessageEntry } from '~/types'

/** Result of the summary generation */
interface SummaryResult {
  /** Summary sentence (e.g. "2 incidents · 1 maintenance planifiée") */
  text: string
  /** Date range (e.g. "Du 01/01/2024 au 15/01/2024") or null if not determinable */
  dateRange: string | null
  /** Total number of entries (incidents or MessageEntry) */
  total: number
}

/**
 * Categorizes an incident title into a semantic category for the summary sentence.
 * Categorization is done by substring matching on the lowercased title.
 *
 * The priority order of the tests matters: "vendor mandated emergency" must
 * be tested before "vendor mandated" to avoid the less specific category.
 *
 * @param title - Title of the incident or the MessageEntry
 * @returns Semantic category for aggregation
 */
function categorize(title: string): string {
  const t = title.toLowerCase()
  if (t.includes('vendor mandated emergency') || t.includes('emergency maintenance')) return 'maintenance urgence'
  if (t.includes('vendor mandated')) return 'maintenance fournisseur'
  if (t.includes('planned maintenance') || t.includes('maintenance planifiée')) return 'maintenance planifiée'
  if (t.includes('maintenance')) return 'maintenance'
  if (t.includes('advisory') || t.includes('service advisory')) return 'advisory'
  if (t.includes('incident') || t.includes('outage') || t.includes('disruption')) return 'incident'
  if (t.includes('resolved') || t.includes('résolu')) return 'résolu'
  return 'autre'
}

/**
 * Parses a date string into a JavaScript Date object.
 * Returns null if the string is empty or not parseable.
 *
 * @param s - Date string (ISO 8601, RFC 2822, or any other format recognized by Date)
 */
function parseDate(s: string): Date | null {
  if (!s) return null
  try { const d = new Date(s); return isNaN(d.getTime()) ? null : d } catch { return null }
}

/**
 * Formats a date in the short French format (dd/mm/yyyy).
 *
 * @param d - Date object to format
 * @returns String in the "15/01/2024" format
 */
function formatShort(d: Date): string {
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/**
 * Generates a text summary from a list of incidents or RSS entries.
 *
 * Algorithm:
 * 1. Extract the titles (ignoring entries without a title)
 * 2. Categorize each title and count by category
 * 3. Build the summary sentence in a predefined semantic order
 * 4. Compute the covered date range (min-max of the dates found)
 *
 * The order of categories in the sentence follows a decreasing severity logic:
 * incidents > advisories > emergency maintenances > vendor maintenances >
 * planned maintenances > generic maintenances > resolved > others
 *
 * @param items - Mixed array of Incidents and/or MessageEntry
 * @returns SummaryResult, or null if the list is empty or has no titles
 *
 * @example
 * buildSummary([
 *   { title: 'Vendor mandated emergency maintenance', level: 'maintenance', ... },
 *   { title: 'Incident in EU region', level: 'majeur', ... },
 *   { title: 'Service advisory for API', level: 'leger', ... },
 * ])
 * // → { text: "1 incident · 1 advisory · 1 maintenance urgence", dateRange: "Le 15/01/2024", total: 3 }
 */
export function buildSummary(items: (Incident | MessageEntry)[]): SummaryResult | null {
  if (!items || items.length === 0) return null

  // Extract the titles, ignoring empty entries
  const titles = items.map((i) => ('title' in i ? i.title : '')).filter(Boolean)
  if (!titles.length) return null

  // Count by semantic category
  const counts = new Map<string, number>()
  for (const title of titles) {
    const cat = categorize(title)
    counts.set(cat, (counts.get(cat) ?? 0) + 1)
  }

  // Build the sentence in severity order
  const parts: string[] = []
  const order = ['incident', 'advisory', 'maintenance urgence', 'maintenance fournisseur', 'maintenance planifiée', 'maintenance', 'résolu', 'autre']
  for (const cat of order) {
    const n = counts.get(cat)
    if (!n) continue
    // Simple pluralization: add 's' unless the category ends with 'e' (already feminine/invariable)
    parts.push(`${n} ${cat}${n > 1 && !cat.endsWith('e') ? 's' : ''}`)
  }

  // Compute the date range from the updatedAt (Incident) or date (MessageEntry) fields
  const dates = items
    .map((i) => {
      const raw = ('updatedAt' in i ? i.updatedAt : null) ?? ('date' in i ? i.date : null) ?? ''
      return parseDate(raw as string)
    })
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime())

  let dateRange: string | null = null
  if (dates.length >= 2) {
    const oldest = dates[0]
    const newest = dates[dates.length - 1]
    // Show a range if the dates differ, otherwise a single date
    if (formatShort(oldest) !== formatShort(newest)) {
      dateRange = `Du ${formatShort(oldest)} au ${formatShort(newest)}`
    }
    else {
      dateRange = `Le ${formatShort(newest)}`
    }
  }
  else if (dates.length === 1) {
    dateRange = `Le ${formatShort(dates[0])}`
  }

  return {
    text: parts.length ? parts.join(' · ') : `${titles.length} entrée${titles.length > 1 ? 's' : ''}`,
    dateRange,
    total: titles.length,
  }
}
