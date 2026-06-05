/**
 * @module utils/summarize
 *
 * Génération d'un résumé textuel lisible depuis une liste d'incidents ou d'entrées.
 *
 * Ce module est utilisé dans l'UI pour afficher une synthèse condensée du contenu
 * d'un service composite ou d'un flux RSS (ex: "3 incidents · 2 maintenances planifiées").
 *
 * Il produit deux informations :
 * - `text`      : phrase décrivant la répartition par catégorie
 * - `dateRange` : plage de dates couverte par les entrées
 */

import type { Incident, MessageEntry } from '~/types'

/** Résultat de la génération de résumé */
interface SummaryResult {
  /** Phrase de synthèse (ex: "2 incidents · 1 maintenance planifiée") */
  text: string
  /** Plage de dates (ex: "Du 01/01/2024 au 15/01/2024") ou null si non déterminable */
  dateRange: string | null
  /** Nombre total d'entrées (incidents ou MessageEntry) */
  total: number
}

/**
 * Catégorise un titre d'incident en une catégorie sémantique pour la phrase de résumé.
 * La catégorisation se fait par correspondance de sous-chaîne sur le titre en minuscules.
 *
 * L'ordre de priorité des tests est important : "vendor mandated emergency" doit
 * être testé avant "vendor mandated" pour éviter la catégorie moins spécifique.
 *
 * @param title - Titre de l'incident ou de la MessageEntry
 * @returns Catégorie sémantique pour l'agrégation
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
 * Parse une chaîne de date en objet Date JavaScript.
 * Retourne null si la chaîne est vide ou non parseable.
 *
 * @param s - Chaîne de date (ISO 8601, RFC 2822, ou autre format reconnu par Date)
 */
function parseDate(s: string): Date | null {
  if (!s) return null
  try { const d = new Date(s); return isNaN(d.getTime()) ? null : d } catch { return null }
}

/**
 * Formate une date en format court français (dd/mm/yyyy).
 *
 * @param d - Objet Date à formater
 * @returns Chaîne au format "15/01/2024"
 */
function formatShort(d: Date): string {
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/**
 * Génère un résumé textuel depuis une liste d'incidents ou d'entrées RSS.
 *
 * Algorithme :
 * 1. Extraire les titres (en ignorant les entrées sans titre)
 * 2. Catégoriser chaque titre et compter par catégorie
 * 3. Construire la phrase de synthèse dans un ordre sémantique prédéfini
 * 4. Calculer la plage de dates couverte (min-max des dates trouvées)
 *
 * L'ordre des catégories dans la phrase suit une logique de sévérité décroissante :
 * incidents > advisories > maintenances urgentes > maintenances fournisseur >
 * maintenances planifiées > maintenances génériques > résolus > autres
 *
 * @param items - Tableau mixte d'Incidents et/ou de MessageEntry
 * @returns SummaryResult, ou null si la liste est vide ou sans titres
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

  // Extraire les titres en ignorant les entrées vides
  const titles = items.map((i) => ('title' in i ? i.title : '')).filter(Boolean)
  if (!titles.length) return null

  // Compter par catégorie sémantique
  const counts = new Map<string, number>()
  for (const title of titles) {
    const cat = categorize(title)
    counts.set(cat, (counts.get(cat) ?? 0) + 1)
  }

  // Construire la phrase dans l'ordre de sévérité
  const parts: string[] = []
  const order = ['incident', 'advisory', 'maintenance urgence', 'maintenance fournisseur', 'maintenance planifiée', 'maintenance', 'résolu', 'autre']
  for (const cat of order) {
    const n = counts.get(cat)
    if (!n) continue
    // Pluriel simple : ajouter 's' sauf si la catégorie se termine par 'e' (déjà féminin/invariable)
    parts.push(`${n} ${cat}${n > 1 && !cat.endsWith('e') ? 's' : ''}`)
  }

  // Calculer la plage de dates depuis les champs updatedAt (Incident) ou date (MessageEntry)
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
    // Afficher une plage si les dates sont différentes, sinon une date unique
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
