/**
 * @module adapters/custom
 *
 * Generic configuration-driven adapter (CustomMapping).
 *
 * Allows monitoring any JSON API (or RSS/Atom) without writing code,
 * by specifying only:
 * - `statusPath`  : path to the status value in the JSON response
 * - `messagePath` : path to the descriptive text (optional)
 * - `levelMap`    : mapping table value → StatusLevel
 *
 * This module also exposes reusable utility functions:
 * - `getValueAtPath` : navigation within a JSON object by dotted path
 * - `matchLevelMap`  : matching value ↔ levelMap pattern
 * - `autoDetectLevel`: heuristic level detection from free-form text
 */

import type { AdapterResult, CustomMapping, Incident, StatusLevel } from '~/types'
import { worstLevel } from '~/types'
import { rssToStructured } from './rss'

/**
 * Navigates within a JSON object following a dotted-notation path.
 * Supports arrays (numeric indices) and the `*` wildcard.
 *
 * Resolution rules:
 * - Each segment is separated by a dot `.`
 * - A numeric segment on an array = access by index (e.g. `items.0.name`)
 * - The `*` segment on an array = map over all elements (returns an array)
 * - If an intermediate segment is null/undefined, returns undefined without error
 *
 * @param obj  - Root object to navigate
 * @param path - Dotted-notation path (e.g. `"status"`, `"data.health"`, `"items.*.status"`)
 * @returns The value at that path, or undefined if the path does not exist
 *
 * @example
 * getValueAtPath({ a: { b: 42 } }, 'a.b')           // → 42
 * getValueAtPath({ items: [{ x: 1 }, { x: 2 }] }, 'items.*.x') // → [1, 2]
 * getValueAtPath({ arr: ['a', 'b'] }, 'arr.0')       // → 'a'
 * getValueAtPath({ a: null }, 'a.b')                  // → undefined
 */
export function getValueAtPath(obj: unknown, path: string): unknown {
  if (!path) return obj
  const parts = path.split('.')

  function resolve(current: unknown, parts: string[]): unknown {
    if (parts.length === 0) return current
    const [head, ...rest] = parts

    // Wildcard: iterate over all array elements and resolve the rest of the path for each
    if (head === '*') {
      if (!Array.isArray(current)) return undefined
      return current.map((item) => resolve(item, rest))
    }

    if (current == null) return undefined

    // Array + numeric segment → access by index
    if (Array.isArray(current)) {
      const idx = Number(head)
      return Number.isNaN(idx) ? undefined : resolve(current[idx], rest)
    }

    if (typeof current !== 'object') return undefined
    return resolve((current as Record<string, unknown>)[head], rest)
  }

  return resolve(obj, parts)
}

/**
 * Heuristically detects a StatusLevel from a free-form text string.
 * Used as a fallback when no levelMap pattern matches.
 *
 * Detection is based on keywords common to English- and French-language
 * status APIs. The comparison is case-insensitive.
 *
 * @param value - Text to analyze (e.g. "partial_outage", "Service is operating normally")
 * @returns The inferred StatusLevel, or "inconnu" if no keyword is recognized
 *
 * @example
 * autoDetectLevel('healthy')           // → 'operational'
 * autoDetectLevel('partial_outage')    // → 'mineur'
 * autoDetectLevel('major_outage')      // → 'majeur'
 * autoDetectLevel('planned maintenance') // → 'maintenance'
 * autoDetectLevel('xyz_custom_state')  // → 'inconnu'
 */
export function autoDetectLevel(value: string): StatusLevel {
  const v = value.toLowerCase()
  if (['healthy', 'operational', 'none', 'ok', 'up', 'normal', 'allsystemsoperational'].some((k) => v === k || v.includes(k))) return 'operational'
  if (['minor', 'advisory', 'warning', 'degraded_performance', 'partial'].some((k) => v.includes(k))) return 'leger'
  if (['major', 'degraded', 'partial_outage', 'major_outage'].some((k) => v.includes(k))) return 'majeur'
  if (['critical', 'outage', 'disruption', 'unhealthy', 'down'].some((k) => v.includes(k))) return 'critique'
  if (['maintenance'].some((k) => v.includes(k))) return 'maintenance'
  if (['info', 'notice', 'update', 'annonce'].some((k) => v.includes(k))) return 'information'
  return 'inconnu'
}

/**
 * Converts any value into a "detectable" string for autoDetectLevel.
 * If the value is an object, concatenates its most relevant text fields
 * (title, name, status, message, description, summary).
 *
 * @param v - Value to convert
 * @returns A representative string (empty if null/undefined)
 */
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
 * Resolves a StatusLevel from a raw value and a levelMap table.
 * Supports 4 pattern syntaxes in the levelMap keys:
 *
 * 1. **Exact** : `"none"` → matches the value exactly (case-insensitive)
 * 2. **Wildcard** : `"healthy*"` or `"*-ok"` — the `*` matches any sequence
 * 3. **Contains** : `"~advisory"` → the value contains "advisory"
 * 4. **Regex** : `"/^healthy$/i"` → a regular expression with optional flags after the final `/`
 *
 * Patterns are evaluated in their declaration order within levelMap.
 * The first match wins.
 * If no pattern matches, returns `null` (the caller uses autoDetectLevel).
 *
 * @param value    - Value to test (the string extracted via statusPath)
 * @param levelMap - Table pattern → StatusLevel
 * @returns A StatusLevel if a pattern matches, null otherwise
 *
 * @example
 * matchLevelMap('healthy_partial', { 'healthy*': 'operational', 'down': 'majeur' })
 * // → 'operational'  (wildcard "healthy*" matches)
 *
 * matchLevelMap('service advisory', { '~advisory': 'leger' })
 * // → 'leger'  (contains "~advisory" matches)
 *
 * matchLevelMap('OUTAGE', { '/outage/i': 'majeur' })
 * // → 'majeur'  (case-insensitive regex matches)
 *
 * matchLevelMap('xyz', { 'none': 'operational' })
 * // → null  (no pattern matches)
 */
export function matchLevelMap(value: string, levelMap: Record<string, StatusLevel>): StatusLevel | null {
  const v = value.toLowerCase()

  for (const [pattern, level] of Object.entries(levelMap)) {
    if (!pattern) continue

    // 1. Exact match (case-insensitive)
    if (pattern === value || pattern.toLowerCase() === v) return level

    // 2. Contains operator: ~word → the value must contain the word
    if (pattern.startsWith('~')) {
      if (v.includes(pattern.slice(1).toLowerCase())) return level
      continue
    }

    // 3. Regex operator: /pattern/flags
    if (pattern.startsWith('/') && pattern.lastIndexOf('/') > 0) {
      try {
        const last = pattern.lastIndexOf('/')
        const body = pattern.slice(1, last)
        const flags = pattern.slice(last + 1)
        if (new RegExp(body, flags).test(value)) return level
      }
      catch { /* invalid regex — silently ignored */ }
      continue
    }

    // 4. Wildcard operator: * in the pattern
    // Converts the wildcard pattern into a regex: "healthy*" → /^healthy.*$/
    if (pattern.includes('*')) {
      // Escape special regex characters except * which becomes .*
      const escaped = pattern.toLowerCase().split('*').map(p => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')
      try {
        if (new RegExp(`^${escaped}$`).test(v)) return level
      }
      catch { /* invalid pattern — silently ignored */ }
    }
  }
  return null
}

/**
 * Resolves a StatusLevel from a raw value (scalar or array).
 * If the value is an array (result of a wildcard), computes the worst level.
 * Tries matchLevelMap first, then autoDetectLevel as a fallback.
 */
function resolveLevel(raw: unknown, levelMap: Record<string, StatusLevel>): StatusLevel {
  if (Array.isArray(raw)) {
    // Wildcard on statusPath → each element yields a level, and we take the worst
    const levels = raw.map(toDetectableString).filter((s) => s.length > 0)
      .map((s) => matchLevelMap(s, levelMap) ?? autoDetectLevel(s))
    return levels.length ? worstLevel(levels) : 'operational'
  }
  const s = toDetectableString(raw)
  return s ? (matchLevelMap(s, levelMap) ?? autoDetectLevel(s)) : 'operational'
}

/**
 * Resolves the textual message from a raw value (scalar or array).
 * If a wildcard is used on messagePath → all texts joined by \n (explanatory texts, not incidents).
 */
function resolveMessage(raw: unknown): string {
  if (Array.isArray(raw)) {
    return raw.map(toDetectableString).filter((s) => s.length > 0).join('\n')
  }
  return toDetectableString(raw)
}

/**
 * Detects whether the received data is raw XML (RSS/Atom) and converts it
 * into a structured, navigable JSON object for mapping.
 *
 * The RSS data is wrapped by the proxy in { _raw: "<?xml ..." }.
 * This function transforms it into RssStructured (see rss.ts) so that
 * paths such as `entries.*.title` work as usual.
 *
 * @param data - Raw data received from the proxy
 * @returns Navigable JSON data (unchanged if no XML is detected)
 */
function resolveData(data: unknown): unknown {
  if (data !== null && typeof data === 'object' && '_raw' in (data as object)) {
    const raw = (data as { _raw: unknown })._raw
    // Detect RSS/Atom XML by its header
    if (typeof raw === 'string' && (raw.includes('<?xml') || raw.includes('<feed') || raw.includes('<rss'))) {
      return rssToStructured(raw)
    }
  }
  return data
}

/**
 * Extracts the parent-array path and the targeted field from a path containing `.*`.
 * Used to separate the "array" part from the "field" part in a wildcard.
 *
 * @param path - Path containing `.*` (e.g. `"entries.*.title"`, `"services.*.status"`)
 * @returns An object { parentPath, field }, or null if there is no `.*` wildcard in the path
 *
 * @example
 * parseWildcardPath('entries.*.title') // → { parentPath: 'entries', field: 'title' }
 * parseWildcardPath('data.items.*.id') // → { parentPath: 'data.items', field: 'id' }
 * parseWildcardPath('status')          // → null (no wildcard)
 */
function parseWildcardPath(path: string): { parentPath: string; field: string } | null {
  const starIdx = path.indexOf('.*.')
  if (starIdx === -1) return null
  return {
    parentPath: path.slice(0, starIdx),
    field: path.slice(starIdx + 3),
  }
}

/**
 * Returns the first non-empty value among a list of an object's native keys.
 * Used for automatic detection of incident fields (title, level, message…)
 * when no explicit path is provided in the mapping.
 *
 * @param o    - Incident object
 * @param keys - Candidate keys, in priority order
 * @returns The first non-null/non-empty value, or undefined
 */
function pickNative(o: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    const v = o[k]
    if (v != null && v !== '') return v
  }
  return undefined
}

/**
 * Generates Incidents from an array of incidents pointed to by `incidentsPath`.
 *
 * Each field (title, level, message) can be targeted explicitly via a path
 * relative to the element (`incidentTitlePath`, `incidentLevelPath`, `incidentMessagePath`),
 * otherwise it is detected automatically among the usual field names.
 * The level is resolved via `levelMap` (matchLevelMap) then auto-detection as a fallback.
 *
 * @param resolved - JSON data after resolution (RSS converted if necessary)
 * @param mapping  - Full mapping (uses incidentsPath + incident fields + levelMap)
 * @returns Array of Incidents (empty if the path does not point to an array)
 */
function buildIncidentsFromPath(resolved: unknown, mapping: CustomMapping): Incident[] {
  const arr = getValueAtPath(resolved, mapping.incidentsPath!)
  if (!Array.isArray(arr)) return []
  const levelMap = mapping.levelMap ?? {}

  return arr
    .map((item, i) => {
      const o = (typeof item === 'object' && item !== null) ? (item as Record<string, unknown>) : {}

      // Title: explicit path, otherwise the usual native fields
      const titleRaw = mapping.incidentTitlePath
        ? getValueAtPath(item, mapping.incidentTitlePath)
        : pickNative(o, ['title', 'name', 'headline', 'summary'])
      const title = toDetectableString(titleRaw)

      // Level: explicit path, otherwise native fields; converted via levelMap then auto-detection
      const levelRaw = mapping.incidentLevelPath
        ? getValueAtPath(item, mapping.incidentLevelPath)
        : pickNative(o, ['level', 'impact', 'severity', 'status'])
      const levelStr = toDetectableString(levelRaw)
      const level: StatusLevel = levelStr
        ? (matchLevelMap(levelStr, levelMap) ?? autoDetectLevel(levelStr))
        : (title ? autoDetectLevel(title) : 'inconnu')

      // Message: explicit path (sub-paths supported), otherwise native fields
      const messageRaw = mapping.incidentMessagePath
        ? getValueAtPath(item, mapping.incidentMessagePath)
        : pickNative(o, ['body', 'description', 'message', 'summary'])
      const message = toDetectableString(messageRaw) || undefined

      const title2 = title || message
      if (!title2) return null

      const url = toDetectableString(pickNative(o, ['url', 'shortlink', 'link', 'href'])) || undefined
      const updatedAt = String(
        pickNative(o, ['updated_at', 'updatedAt', 'updated', 'pubDate', 'date', 'created_at', 'startedAt'])
          ?? new Date().toISOString(),
      )
      const id = toDetectableString(pickNative(o, ['id', 'guid'])) || `custom-${i}`

      const incident: Incident = { id, title: title2, level, startedAt: updatedAt, updatedAt }
      if (message && message !== title2) incident.message = message
      if (url) incident.url = url
      return incident
    })
    .filter((inc): inc is Incident => inc !== null)
}

/**
 * Generates Incidents from an array of items when statusPath contains a wildcard.
 *
 * Logic:
 * - Generates incidents ONLY if statusPath has a wildcard (e.g. `components.*.status`)
 * - If messagePath also has a wildcard (e.g. `components.*.name`), it provides the incident text
 * - If messagePath does NOT have a wildcard, the texts are treated as a global message (not incidents)
 *
 * For each item in the parent array:
 * - The title is extracted via the wildcard field of statusPath
 * - The level is determined via levelMap then autoDetectLevel
 * - The message is extracted via the wildcard field of messagePath (or native summary/description)
 * - The URL and date are extracted from the object's native fields (link, updated, pubDate)
 *
 * @param resolved    - JSON data after resolution (potentially converted from RSS)
 * @param statusPath  - Status path (with or without a wildcard)
 * @param messagePath - Message path (optional, with or without a wildcard)
 * @param levelMap    - Mapping table for the levels
 * @returns Array of Incidents (empty if statusPath has no wildcard)
 */
function buildIncidents(
  resolved: unknown,
  statusPath: string,
  messagePath: string | undefined,
  levelMap: Record<string, StatusLevel>,
): Incident[] {
  const statusWc = parseWildcardPath(statusPath)

  // Incidents are generated only if statusPath has a wildcard
  // A messagePath wildcard alone = explanatory texts (MessageEntry), not incidents
  if (!statusWc) return []
  const wc = statusWc
  const msgWc = messagePath ? parseWildcardPath(messagePath) : null

  const parentArray = getValueAtPath(resolved, wc.parentPath)
  if (!Array.isArray(parentArray)) return []

  return parentArray
    .map((item, i) => {
      const o = (typeof item === 'object' && item !== null) ? (item as Record<string, unknown>) : {}

      // Title: the statusWc.field field if available, otherwise the native 'title' field, otherwise the msgWc field
      const titleRaw = statusWc
        ? getValueAtPath(item, statusWc.field)
        : (o.title ?? (msgWc ? getValueAtPath(item, msgWc.field) : undefined))
      const title = toDetectableString(titleRaw)
      if (!title) return null

      // Level: first an exact match in levelMap, otherwise auto-detection
      const level = levelMap[title] ?? autoDetectLevel(title)

      // Message: the msgWc.field field if available, otherwise the native summary/description fields
      const messageRaw = msgWc
        ? getValueAtPath(item, msgWc.field)
        : (o.summary ?? o.description ?? o.message)
      const message = toDetectableString(messageRaw) || undefined

      // Date and URL from the standard native fields
      const updatedAt = String(o.updated ?? o.pubDate ?? o.date ?? new Date().toISOString())
      const url = typeof o.link === 'string' && o.link ? o.link : undefined

      const incident: Incident = { id: `custom-${i}`, title, level, startedAt: updatedAt, updatedAt }
      // Only add the message if it differs from the title (avoids duplicates)
      if (message && message !== title) incident.message = message
      if (url) incident.url = url
      return incident
    })
    .filter((inc): inc is NonNullable<typeof inc> => inc !== null)
}

/**
 * Extracts structured MessageEntry objects from a wildcard path to objects.
 * Used to populate the "Entries" tab in the UI (informational list without a level).
 *
 * Supports two wildcard forms:
 * - `entries.*`        : the full item — extracts native title, summary, date, url
 * - `entries.*.summary`: a specific field — field is the summary, native title if available
 *
 * @param resolved - JSON data after resolution
 * @param msgPath  - messagePath containing `.*`
 * @returns Array of MessageEntry, or undefined if the path is not a valid wildcard
 *
 * @example
 * // For a structured RSS with entries.*.summary as messagePath
 * buildMessageEntries(rssData, 'entries.*.summary')
 * // → [{ title: 'Incident #1', summary: 'Service degraded', date: '...', url: '...' }, ...]
 */
function buildMessageEntries(resolved: unknown, msgPath: string): import('~/types').MessageEntry[] | undefined {
  // Verify that the path does contain a wildcard
  const isWild = msgPath.includes('.*')
  if (!isWild) return undefined

  // Normalize "entries.*" (with no field after) by appending a trailing dot for parseWildcardPath
  const wc = parseWildcardPath(msgPath + (msgPath.endsWith('.*') ? '.' : ''))
    ?? parseWildcardPath(msgPath)
  if (!wc) return undefined

  const arr = getValueAtPath(resolved, wc.parentPath)
  if (!Array.isArray(arr)) return undefined

  const entries: import('~/types').MessageEntry[] = []
  for (const item of arr) {
    if (item == null) continue
    const o = typeof item === 'object' ? (item as Record<string, unknown>) : {}

    // If a specific field is targeted (entries.*.summary):
    //   - fieldValue = value of the targeted field → this is the summary
    //   - title = the object's native 'title' field, or the fieldValue if there is no native title
    // Otherwise (entries.*):
    //   - title = native 'title' or 'name' field
    //   - summary = native summary/description/message field
    const fieldValue = wc.field ? toDetectableString(getValueAtPath(item, wc.field)) : ''
    const title = wc.field
      ? (toDetectableString(o.title) || fieldValue)
      : toDetectableString(o.title ?? o.name)
    const summary = wc.field
      ? (fieldValue !== title ? fieldValue : toDetectableString(o.summary ?? o.description))
      : toDetectableString(o.summary ?? o.description ?? o.message)

    // Skip items with no usable text content
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

/**
 * Main adapter — parses a raw response according to a CustomMapping.
 *
 * Processing pipeline:
 * 1. `resolveData`      : converts RSS XML into navigable JSON if necessary
 * 2. `getValueAtPath`   : extracts the raw value via statusPath
 * 3. `resolveLevel`     : determines the StatusLevel (via levelMap + autoDetect + worstLevel if wildcard)
 * 4. `resolveMessage`   : extracts the textual message via messagePath (or statusPath as a fallback)
 * 5. `buildIncidents`   : generates Incidents if statusPath contains a wildcard
 * 6. `buildMessageEntries`: generates MessageEntry objects if messagePath contains a wildcard
 *
 * @param data    - Raw proxy data (parsed JSON or { _raw: string } for XML)
 * @param mapping - Mapping configuration (statusPath, messagePath, levelMap)
 * @returns Normalized AdapterResult
 *
 * @example
 * // Simple API with a scalar status
 * parseCustom({ status: 'degraded' }, {
 *   statusPath: 'status',
 *   levelMap: { 'degraded': 'mineur', 'healthy': 'operational' }
 * })
 * // → { level: 'mineur', message: 'degraded', incidents: [] }
 *
 * @example
 * // API with an array of components
 * parseCustom({ components: [{ name: 'API', health: 'outage' }] }, {
 *   statusPath: 'components.*.health',
 *   messagePath: 'components.*.name',
 *   levelMap: { 'outage': 'majeur', 'healthy': 'operational' }
 * })
 * // → { level: 'majeur', message: 'API', incidents: [{ title: 'outage', level: 'majeur', ... }] }
 */
export function parseCustom(data: unknown, mapping: CustomMapping): AdapterResult {
  // Step 1: convert RSS/XML into navigable JSON if necessary
  const resolved = resolveData(data)

  // Steps 2 & 3: extract the status value and determine the level
  const rawStatus = getValueAtPath(resolved, mapping.statusPath)
  let level = resolveLevel(rawStatus, mapping.levelMap)

  // Step 5: build the incidents.
  // If an explicit `incidentsPath` is provided, we use it (a dedicated mapping, on the same
  // footing as status/message). Otherwise, the legacy behavior: a wildcard on statusPath.
  const incidents = mapping.incidentsPath
    ? buildIncidentsFromPath(resolved, mapping)
    : buildIncidents(resolved, mapping.statusPath, mapping.messagePath, mapping.levelMap)

  // If no statusPath is defined but incidents exist, the global level
  // reflects the worst incident — a mapping can thus describe ONLY incidents.
  if (!mapping.statusPath && incidents.length) {
    level = worstLevel(incidents.map((inc) => inc.level))
  }

  // Step 4: extract the message (messagePath takes priority, statusPath as a fallback)
  const rawMessage = mapping.messagePath
    ? getValueAtPath(resolved, mapping.messagePath)
    : rawStatus
  let message = resolveMessage(rawMessage)
  if (!message) message = incidents.length ? `${incidents.length} incident(s)` : 'Unknown status'

  // Step 6: build the entries according to the messagePath wildcard
  const entries = mapping.messagePath
    ? buildMessageEntries(resolved, mapping.messagePath)
    : undefined

  return { level, message, incidents, entries }
}
