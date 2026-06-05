import type { AdapterResult, CustomMapping, Incident, StatusLevel } from '~/types'
import { worstLevel } from '~/types'
import { rssToStructured } from './rss'

export function getValueAtPath(obj: unknown, path: string): unknown {
  if (!path) return obj
  const parts = path.split('.')

  function resolve(current: unknown, parts: string[]): unknown {
    if (parts.length === 0) return current
    const [head, ...rest] = parts

    if (head === '*') {
      if (!Array.isArray(current)) return undefined
      return current.map((item) => resolve(item, rest))
    }

    if (current == null) return undefined
    if (Array.isArray(current)) {
      const idx = Number(head)
      return Number.isNaN(idx) ? undefined : resolve(current[idx], rest)
    }
    if (typeof current !== 'object') return undefined
    return resolve((current as Record<string, unknown>)[head], rest)
  }

  return resolve(obj, parts)
}

export function autoDetectLevel(value: string): StatusLevel {
  const v = value.toLowerCase()
  if (['healthy', 'operational', 'none', 'ok', 'up', 'normal', 'allsystemsoperational'].some((k) => v === k || v.includes(k))) return 'operational'
  if (['minor', 'advisory', 'warning', 'degraded_performance', 'partial'].some((k) => v.includes(k))) return 'leger'
  if (['major', 'degraded', 'partial_outage'].some((k) => v.includes(k))) return 'mineur'
  if (['critical', 'outage', 'disruption', 'unhealthy', 'down', 'major_outage'].some((k) => v.includes(k))) return 'majeur'
  if (['maintenance'].some((k) => v.includes(k))) return 'maintenance'
  if (['info', 'notice', 'update', 'annonce'].some((k) => v.includes(k))) return 'information'
  return 'inconnu'
}

function toDetectableString(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    return [o.title, o.name, o.status, o.message, o.description, o.summary]
      .filter((x): x is string => typeof x === 'string' && x.length > 0)
      .join(' ')
  }
  return String(v)
}

/**
 * Résout un niveau depuis levelMap avec support de patterns :
 * - exact      : "none" → niveau
 * - wildcard   : "healthy*" ou "*-ok" (caractère * = n'importe quoi)
 * - contains   : "~advisory" → si la valeur contient "advisory"
 * - regex      : "/^healthy$/i" → regex avec flags optionnels
 */
export function matchLevelMap(value: string, levelMap: Record<string, StatusLevel>): StatusLevel | null {
  const v = value.toLowerCase()

  for (const [pattern, level] of Object.entries(levelMap)) {
    if (!pattern) continue

    // Exact
    if (pattern === value || pattern.toLowerCase() === v) return level

    // Contains : ~mot
    if (pattern.startsWith('~')) {
      if (v.includes(pattern.slice(1).toLowerCase())) return level
      continue
    }

    // Regex : /pattern/flags
    if (pattern.startsWith('/') && pattern.lastIndexOf('/') > 0) {
      try {
        const last = pattern.lastIndexOf('/')
        const body = pattern.slice(1, last)
        const flags = pattern.slice(last + 1)
        if (new RegExp(body, flags).test(value)) return level
      }
      catch { /* regex invalide */ }
      continue
    }

    // Wildcard : * dans le pattern
    if (pattern.includes('*')) {
      const escaped = pattern.toLowerCase().split('*').map(p => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')
      try {
        if (new RegExp(`^${escaped}$`).test(v)) return level
      }
      catch { /* pattern invalide */ }
    }
  }
  return null
}

function resolveLevel(raw: unknown, levelMap: Record<string, StatusLevel>): StatusLevel {
  if (Array.isArray(raw)) {
    const levels = raw.map(toDetectableString).filter((s) => s.length > 0)
      .map((s) => matchLevelMap(s, levelMap) ?? autoDetectLevel(s))
    return levels.length ? worstLevel(levels) : 'operational'
  }
  const s = toDetectableString(raw)
  return s ? (matchLevelMap(s, levelMap) ?? autoDetectLevel(s)) : 'operational'
}

// messagePath wildcard → tous les textes joints par \n (textes explicatifs, pas des incidents)
function resolveMessage(raw: unknown): string {
  if (Array.isArray(raw)) {
    return raw.map(toDetectableString).filter((s) => s.length > 0).join('\n')
  }
  return toDetectableString(raw)
}

function resolveData(data: unknown): unknown {
  if (data !== null && typeof data === 'object' && '_raw' in (data as object)) {
    const raw = (data as { _raw: unknown })._raw
    if (typeof raw === 'string' && (raw.includes('<?xml') || raw.includes('<feed') || raw.includes('<rss'))) {
      return rssToStructured(raw)
    }
  }
  return data
}

/** Extrait le chemin du parent array depuis un path avec wildcard.
 *  ex: "entries.*.title" → parent = "entries", field = "title" */
function parseWildcardPath(path: string): { parentPath: string; field: string } | null {
  const starIdx = path.indexOf('.*.')
  if (starIdx === -1) return null
  return {
    parentPath: path.slice(0, starIdx),
    field: path.slice(starIdx + 3),
  }
}

/** Génère des incidents depuis un tableau d'items quand statusPath OU messagePath a un wildcard */
function buildIncidents(
  resolved: unknown,
  statusPath: string,
  messagePath: string | undefined,
  levelMap: Record<string, StatusLevel>,
): Incident[] {
  const statusWc = parseWildcardPath(statusPath)

  // Incidents seulement si statusPath a un wildcard — messagePath wildcard = textes explicatifs, pas des incidents
  if (!statusWc) return []
  const wc = statusWc
  const msgWc = messagePath ? parseWildcardPath(messagePath) : null

  const parentArray = getValueAtPath(resolved, wc.parentPath)
  if (!Array.isArray(parentArray)) return []

  return parentArray
    .map((item, i) => {
      const o = (typeof item === 'object' && item !== null) ? (item as Record<string, unknown>) : {}

      // Titre : champ statusWc si disponible, sinon champ natif 'title', sinon champ msgWc
      const titleRaw = statusWc
        ? getValueAtPath(item, statusWc.field)
        : (o.title ?? (msgWc ? getValueAtPath(item, msgWc.field) : undefined))
      const title = toDetectableString(titleRaw)
      if (!title) return null

      const level = levelMap[title] ?? autoDetectLevel(title)

      // Message : champ msgWc si disponible, sinon champs natifs summary/description
      const messageRaw = msgWc
        ? getValueAtPath(item, msgWc.field)
        : (o.summary ?? o.description ?? o.message)
      const message = toDetectableString(messageRaw) || undefined

      const updatedAt = String(o.updated ?? o.pubDate ?? o.date ?? new Date().toISOString())
      const url = typeof o.link === 'string' && o.link ? o.link : undefined

      const incident: Incident = { id: `custom-${i}`, title, level, startedAt: updatedAt, updatedAt }
      if (message && message !== title) incident.message = message
      if (url) incident.url = url
      return incident
    })
    .filter((inc): inc is NonNullable<typeof inc> => inc !== null)
}

/** Extrait des MessageEntry structurées depuis un path wildcard vers des objets */
function buildMessageEntries(resolved: unknown, msgPath: string): import('~/types').MessageEntry[] | undefined {
  // Supporter entries.* (item complet) et entries.*.field
  const isWild = msgPath.includes('.*')
  if (!isWild) return undefined

  // Normaliser : "entries.*" → parent="entries", field=""
  const wc = parseWildcardPath(msgPath + (msgPath.endsWith('.*') ? '.' : ''))
    ?? parseWildcardPath(msgPath)
  if (!wc) return undefined

  const arr = getValueAtPath(resolved, wc.parentPath)
  if (!Array.isArray(arr)) return undefined

  const entries: import('~/types').MessageEntry[] = []
  for (const item of arr) {
    if (item == null) continue
    const o = typeof item === 'object' ? (item as Record<string, unknown>) : {}

    // Si field spécifié (entries.*.summary) → field est le texte, titre = field natif ou field lui-même
    const fieldValue = wc.field ? toDetectableString(getValueAtPath(item, wc.field)) : ''
    const title = wc.field
      ? (toDetectableString(o.title) || fieldValue)
      : toDetectableString(o.title ?? o.name)
    const summary = wc.field
      ? (fieldValue !== title ? fieldValue : toDetectableString(o.summary ?? o.description))
      : toDetectableString(o.summary ?? o.description ?? o.message)

    if (!title && !summary) continue

    entries.push({
      title: title || summary,
      summary: summary && summary !== title ? summary : undefined,
      date: String(o.updated ?? o.pubDate ?? o.date ?? ''),
      url: typeof o.link === 'string' && o.link ? o.link : undefined,
    })
  }
  return entries.length ? entries : undefined
}

export function parseCustom(data: unknown, mapping: CustomMapping): AdapterResult {
  const resolved = resolveData(data)
  const rawStatus = getValueAtPath(resolved, mapping.statusPath)
  const level = resolveLevel(rawStatus, mapping.levelMap)

  const rawMessage = mapping.messagePath
    ? getValueAtPath(resolved, mapping.messagePath)
    : rawStatus
  const message = resolveMessage(rawMessage) || 'Statut inconnu'

  const incidents = buildIncidents(resolved, mapping.statusPath, mapping.messagePath, mapping.levelMap)
  const entries = mapping.messagePath
    ? buildMessageEntries(resolved, mapping.messagePath)
    : undefined

  return { level, message, incidents, entries }
}
