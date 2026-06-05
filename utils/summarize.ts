import type { Incident, MessageEntry } from '~/types'

interface SummaryResult {
  text: string
  dateRange: string | null
  total: number
}

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

function parseDate(s: string): Date | null {
  if (!s) return null
  try { const d = new Date(s); return isNaN(d.getTime()) ? null : d } catch { return null }
}

function formatShort(d: Date): string {
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function buildSummary(items: (Incident | MessageEntry)[]): SummaryResult | null {
  if (!items || items.length === 0) return null

  // Déduplique et ignore items vides
  const titles = items.map((i) => ('title' in i ? i.title : '')).filter(Boolean)
  if (!titles.length) return null

  // Compter par catégorie
  const counts = new Map<string, number>()
  for (const title of titles) {
    const cat = categorize(title)
    counts.set(cat, (counts.get(cat) ?? 0) + 1)
  }

  // Construire phrase
  const parts: string[] = []
  const order = ['incident', 'advisory', 'maintenance urgence', 'maintenance fournisseur', 'maintenance planifiée', 'maintenance', 'résolu', 'autre']
  for (const cat of order) {
    const n = counts.get(cat)
    if (!n) continue
    parts.push(`${n} ${cat}${n > 1 && !cat.endsWith('e') ? 's' : ''}`)
  }

  // Plage de dates
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
