/**
 * @module adapters/rss
 *
 * Adapter pour les flux RSS 2.0 et Atom 1.0.
 *
 * Le proxy Nitro retourne le contenu XML brut encapsulé dans `{ _raw: "<xml>..." }`
 * car il ne peut pas parser le Content-Type "application/xml" comme du JSON.
 *
 * Ce module expose deux fonctions :
 * - `rssToStructured` : convertit le XML brut en objet JSON navigable (RssStructured).
 *   Utilisé à la fois par parseRss ET par l'adapter custom (pour permettre le mapping
 *   sur des flux RSS via des chemins comme `entries.*.title`).
 * - `parseRss` : adapter complet qui transforme un flux RSS en AdapterResult.
 *
 * Compatibilité :
 * - RSS 2.0  : balises `<item>`, `<title>`, `<description>`, `<pubDate>`, `<link>`
 * - Atom 1.0 : balises `<entry>`, `<title>`, `<summary>`, `<updated>`, `<link href="...">`
 * - CDATA    : le contenu CDATA est extrait avant le stripping HTML
 *
 * Détection du niveau :
 * Le niveau est déduit heuristiquement depuis le titre et le résumé de chaque entrée.
 * Il n'y a pas de champ "impact" standardisé dans RSS/Atom.
 */

import type { AdapterResult, Incident, StatusLevel } from '~/types'

/**
 * Extrait le contenu texte d'une balise XML (première occurrence).
 * Gère CDATA et strips les balises HTML résiduelles.
 *
 * @param xml - Fragment XML à analyser
 * @param tag - Nom de la balise (ex: "title", "summary")
 * @returns Contenu textuel nettoyé, ou '' si la balise est absente
 */
function extractTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  if (!m) return ''
  let content = m[1]
  // Extraire le contenu CDATA avant de stripper les tags
  content = content.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  // Supprimer les éventuels tags HTML restants
  content = content.replace(/<[^>]+>/g, '')
  return content.trim()
}

/**
 * Extrait la valeur d'un attribut d'une balise XML.
 * Utilisé pour `<link href="...">` dans Atom (contrairement à RSS où link est un élément texte).
 *
 * @param xml  - Fragment XML à analyser
 * @param tag  - Nom de la balise
 * @param attr - Nom de l'attribut
 * @returns Valeur de l'attribut, ou '' si absent
 */
function extractAttr(xml: string, tag: string, attr: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*\\s${attr}="([^"]*)"`, 'i'))
  return m ? m[1] : ''
}

/**
 * Extrait tous les fragments XML correspondant à une balise (toutes les occurrences).
 * Utilisé pour itérer sur les `<entry>` (Atom) et `<item>` (RSS).
 *
 * @param xml - XML complet du flux
 * @param tag - Nom de la balise à extraire
 * @returns Tableau de fragments XML (un par occurrence)
 */
function extractAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[\\s>][\\s\\S]*?<\\/${tag}>`, 'gi')
  return xml.match(re) ?? []
}

/**
 * Détecte heuristiquement un StatusLevel depuis le texte d'une entrée RSS/Atom.
 * Analyse le titre ET le résumé combinés pour une meilleure précision.
 *
 * @param text - Texte combiné (titre + ' ' + résumé)
 * @returns StatusLevel déduit, ou 'leger' par défaut (conservateur pour un flux)
 */
function guessLevel(text: string): StatusLevel {
  const t = text.toLowerCase()
  if (t.includes('resolved') || t.includes('résolu')) return 'operational'
  if (t.includes('critical') || t.includes('outage') || t.includes('disruption')) return 'majeur'
  if (t.includes('degraded') || t.includes('partial')) return 'mineur'
  if (t.includes('investigating') || t.includes('advisory') || t.includes('warning')) return 'leger'
  if (t.includes('maintenance')) return 'maintenance'
  // Défaut : légère perturbation (on est dans un flux d'incidents, pas de statut normal)
  return 'leger'
}

/**
 * Représentation d'une entrée normalisée depuis RSS/Atom.
 * Champs communs aux deux formats après normalisation.
 */
export interface RssEntry {
  /** Titre de l'entrée (balise title) */
  title: string
  /** Résumé/description (summary, description ou content) */
  summary: string
  /** Date de mise à jour ou de publication (updated ou pubDate) */
  updated: string
  /** URL de l'entrée (href de link Atom ou texte de link RSS) */
  link: string
}

/**
 * Structure JSON navigable générée depuis un flux RSS/Atom brut.
 * Permet d'utiliser les chemins de l'adapter custom (ex: `entries.*.title`).
 */
export interface RssStructured {
  /** Titre du flux (première balise title du canal) */
  feed_title: string
  /** Date de dernière mise à jour du flux (updated ou lastBuildDate) */
  feed_updated: string
  /** Nombre total d'entrées dans le flux */
  entry_count: number
  /** Entrées normalisées (Atom entry + RSS item fusionnés) */
  entries: RssEntry[]
}

/**
 * Convertit un flux RSS/Atom XML brut en objet JSON structuré et navigable.
 *
 * Cette fonction est utilisée à deux endroits :
 * 1. Par `parseRss` pour générer les incidents automatiquement
 * 2. Par `resolveData` dans custom.ts pour permettre le mapping personnalisé
 *    (l'arbre JSON généré est celui visible dans l'explorateur de l'UI)
 *
 * Compatibilité :
 * - Atom 1.0 : extrait les balises `<entry>`
 * - RSS 2.0  : extrait les balises `<item>`
 * - Les deux coexistent si présents (unlikely mais supporté)
 *
 * @param raw - Contenu XML brut du flux (depuis `{ _raw: "..." }`)
 * @returns Objet RssStructured avec les entrées normalisées
 *
 * @example
 * // Après appel, le résultat est navigable par l'adapter custom :
 * // entries.*.title    → titres de toutes les entrées
 * // entries.*.summary  → résumés de toutes les entrées
 * // entries.0.link     → lien de la première entrée
 * const structured = rssToStructured(xmlString)
 * // → { feed_title: "...", entry_count: 5, entries: [...] }
 */
export function rssToStructured(raw: string): RssStructured {
  const feedTitle = extractTag(raw, 'title')
  const feedUpdated = extractTag(raw, 'updated') || extractTag(raw, 'lastBuildDate') || ''

  // Combiner entries Atom et items RSS (cas rare mais supporté)
  const rawEntries = [
    ...extractAll(raw, 'entry'),  // Atom 1.0
    ...extractAll(raw, 'item'),   // RSS 2.0
  ]

  const entries: RssEntry[] = rawEntries.map((entry) => ({
    title: extractTag(entry, 'title'),
    // Tenter summary (Atom), description (RSS), puis content comme dernier recours
    summary: extractTag(entry, 'summary') || extractTag(entry, 'description') || extractTag(entry, 'content') || '',
    // Tenter updated (Atom) puis pubDate (RSS)
    updated: extractTag(entry, 'updated') || extractTag(entry, 'pubDate') || '',
    // Tenter href d'attribut (Atom) puis texte de balise (RSS)
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
 * Parse un flux RSS/Atom brut en AdapterResult.
 *
 * La présence d'entrées est interprétée comme un signe d'incident (les flux RSS
 * de statut ne publient généralement des entrées que lors de problèmes).
 *
 * Filtrage : les entrées sans titre ni contenu (ex: éléments "header" génériques
 * insérés par certains services) sont ignorées.
 *
 * @param data - Réponse du proxy contenant `{ _raw: "<xml>..." }`
 * @returns AdapterResult avec le niveau le plus grave parmi les entrées
 */
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
      // Analyser le titre ET le résumé ensemble pour une meilleure détection
      level: guessLevel(entry.title + ' ' + entry.summary),
      startedAt: entry.updated,
      updatedAt: entry.updated,
      message: entry.summary || undefined,
      url: entry.link || undefined,
    }))

  // Le niveau global est le pire niveau parmi toutes les entrées du flux
  const worstLevel = incidents.reduce<StatusLevel>((worst, inc) => {
    const order: StatusLevel[] = ['operational', 'maintenance', 'leger', 'mineur', 'majeur']
    return order.indexOf(inc.level) > order.indexOf(worst) ? inc.level : worst
  }, 'leger') // Défaut 'leger' : un flux non vide est au minimum une légère perturbation

  return {
    level: worstLevel,
    message: `${incidents.length} entrée(s) dans le flux`,
    incidents,
  }
}
