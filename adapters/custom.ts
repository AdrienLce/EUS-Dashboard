/**
 * @module adapters/custom
 *
 * Adapter générique piloté par configuration (CustomMapping).
 *
 * Permet de surveiller n'importe quelle API JSON (ou RSS/Atom) sans écrire de code,
 * en spécifiant uniquement :
 * - `statusPath`  : chemin vers la valeur de statut dans la réponse JSON
 * - `messagePath` : chemin vers le texte descriptif (optionnel)
 * - `levelMap`    : table de correspondance valeur → StatusLevel
 *
 * Ce module expose également des fonctions utilitaires réutilisables :
 * - `getValueAtPath` : navigation dans un objet JSON par chemin pointé
 * - `matchLevelMap`  : correspondance valeur ↔ pattern du levelMap
 * - `autoDetectLevel`: détection heuristique du niveau depuis un texte libre
 */

import type { AdapterResult, CustomMapping, Incident, StatusLevel } from '~/types'
import { worstLevel } from '~/types'
import { rssToStructured } from './rss'

/**
 * Navigue dans un objet JSON en suivant un chemin en notation pointée.
 * Supporte les tableaux (index numériques) et le wildcard `*`.
 *
 * Règles de résolution :
 * - Chaque segment est séparé par un point `.`
 * - Un segment numérique sur un tableau = accès par index (ex: `items.0.name`)
 * - Le segment `*` sur un tableau = map sur tous les éléments (retourne un tableau)
 * - Si un segment intermédiaire est null/undefined, retourne undefined sans erreur
 *
 * @param obj  - Objet racine à naviguer
 * @param path - Chemin en notation pointée (ex: `"status"`, `"data.health"`, `"items.*.status"`)
 * @returns La valeur à ce chemin, ou undefined si le chemin n'existe pas
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

    // Wildcard : itère tous les éléments du tableau et résout le reste du chemin pour chacun
    if (head === '*') {
      if (!Array.isArray(current)) return undefined
      return current.map((item) => resolve(item, rest))
    }

    if (current == null) return undefined

    // Tableau + segment numérique → accès par index
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
 * Détecte heuristiquement un StatusLevel à partir d'une chaîne de texte libre.
 * Utilisé comme fallback quand aucun pattern du levelMap ne correspond.
 *
 * La détection se base sur des mots-clés communs dans les APIs de statut anglophones
 * et francophones. La comparaison est insensible à la casse.
 *
 * @param value - Texte à analyser (ex: "partial_outage", "Service is operating normally")
 * @returns StatusLevel déduit, ou "inconnu" si aucun mot-clé reconnu
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
  if (['major', 'degraded', 'partial_outage'].some((k) => v.includes(k))) return 'mineur'
  if (['critical', 'outage', 'disruption', 'unhealthy', 'down', 'major_outage'].some((k) => v.includes(k))) return 'majeur'
  if (['maintenance'].some((k) => v.includes(k))) return 'maintenance'
  if (['info', 'notice', 'update', 'annonce'].some((k) => v.includes(k))) return 'information'
  return 'inconnu'
}

/**
 * Convertit une valeur quelconque en chaîne "détectable" pour autoDetectLevel.
 * Si la valeur est un objet, concatène ses champs textuels les plus pertinents
 * (title, name, status, message, description, summary).
 *
 * @param v - Valeur à convertir
 * @returns Chaîne représentative (vide si null/undefined)
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
 * Résout un StatusLevel depuis une valeur brute et une table levelMap.
 * Supporte 4 syntaxes de pattern dans les clés du levelMap :
 *
 * 1. **Exact** : `"none"` → correspond exactement à la valeur (insensible à la casse)
 * 2. **Wildcard** : `"healthy*"` ou `"*-ok"` — le `*` remplace n'importe quelle séquence
 * 3. **Contains** : `"~advisory"` → la valeur contient "advisory"
 * 4. **Regex** : `"/^healthy$/i"` → expression régulière avec flags optionnels après le `/` final
 *
 * Les patterns sont évalués dans l'ordre de déclaration dans levelMap.
 * La première correspondance gagne.
 * Si aucun pattern ne correspond, retourne `null` (le caller utilise autoDetectLevel).
 *
 * @param value    - Valeur à tester (la chaîne extraite via statusPath)
 * @param levelMap - Table pattern → StatusLevel
 * @returns StatusLevel si un pattern correspond, null sinon
 *
 * @example
 * matchLevelMap('healthy_partial', { 'healthy*': 'operational', 'down': 'majeur' })
 * // → 'operational'  (wildcard "healthy*" correspond)
 *
 * matchLevelMap('service advisory', { '~advisory': 'leger' })
 * // → 'leger'  (contains "~advisory" correspond)
 *
 * matchLevelMap('OUTAGE', { '/outage/i': 'majeur' })
 * // → 'majeur'  (regex insensible à la casse correspond)
 *
 * matchLevelMap('xyz', { 'none': 'operational' })
 * // → null  (aucun pattern ne correspond)
 */
export function matchLevelMap(value: string, levelMap: Record<string, StatusLevel>): StatusLevel | null {
  const v = value.toLowerCase()

  for (const [pattern, level] of Object.entries(levelMap)) {
    if (!pattern) continue

    // 1. Correspondance exacte (insensible à la casse)
    if (pattern === value || pattern.toLowerCase() === v) return level

    // 2. Opérateur contains : ~mot → la valeur doit contenir le mot
    if (pattern.startsWith('~')) {
      if (v.includes(pattern.slice(1).toLowerCase())) return level
      continue
    }

    // 3. Opérateur regex : /pattern/flags
    if (pattern.startsWith('/') && pattern.lastIndexOf('/') > 0) {
      try {
        const last = pattern.lastIndexOf('/')
        const body = pattern.slice(1, last)
        const flags = pattern.slice(last + 1)
        if (new RegExp(body, flags).test(value)) return level
      }
      catch { /* regex invalide — on ignore silencieusement */ }
      continue
    }

    // 4. Opérateur wildcard : * dans le pattern
    // Convertit le pattern wildcard en regex : "healthy*" → /^healthy.*$/
    if (pattern.includes('*')) {
      // Échapper les caractères spéciaux regex sauf * qui devient .*
      const escaped = pattern.toLowerCase().split('*').map(p => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')
      try {
        if (new RegExp(`^${escaped}$`).test(v)) return level
      }
      catch { /* pattern invalide — on ignore silencieusement */ }
    }
  }
  return null
}

/**
 * Résout un StatusLevel depuis une valeur brute (scalaire ou tableau).
 * Si la valeur est un tableau (résultat d'un wildcard), calcule le pire niveau.
 * Tente d'abord matchLevelMap, puis autoDetectLevel en fallback.
 */
function resolveLevel(raw: unknown, levelMap: Record<string, StatusLevel>): StatusLevel {
  if (Array.isArray(raw)) {
    // Wildcard sur statusPath → chaque élément donne un niveau, on prend le pire
    const levels = raw.map(toDetectableString).filter((s) => s.length > 0)
      .map((s) => matchLevelMap(s, levelMap) ?? autoDetectLevel(s))
    return levels.length ? worstLevel(levels) : 'operational'
  }
  const s = toDetectableString(raw)
  return s ? (matchLevelMap(s, levelMap) ?? autoDetectLevel(s)) : 'operational'
}

/**
 * Résout le message textuel depuis une valeur brute (scalaire ou tableau).
 * Si wildcard sur messagePath → tous les textes joints par \n (textes explicatifs, pas des incidents).
 */
function resolveMessage(raw: unknown): string {
  if (Array.isArray(raw)) {
    return raw.map(toDetectableString).filter((s) => s.length > 0).join('\n')
  }
  return toDetectableString(raw)
}

/**
 * Détecte si les données reçues sont du XML brut (RSS/Atom) et les convertit
 * en objet JSON structuré navigable pour le mapping.
 *
 * La donnée RSS est encapsulée par le proxy dans { _raw: "<?xml ..." }.
 * Cette fonction la transforme en RssStructured (voir rss.ts) afin que
 * les chemins comme `entries.*.title` fonctionnent normalement.
 *
 * @param data - Données brutes reçues du proxy
 * @returns Données JSON navigables (inchangées si pas de XML détecté)
 */
function resolveData(data: unknown): unknown {
  if (data !== null && typeof data === 'object' && '_raw' in (data as object)) {
    const raw = (data as { _raw: unknown })._raw
    // Détecter le XML RSS/Atom par son en-tête
    if (typeof raw === 'string' && (raw.includes('<?xml') || raw.includes('<feed') || raw.includes('<rss'))) {
      return rssToStructured(raw)
    }
  }
  return data
}

/**
 * Extrait le chemin du parent array et le champ ciblé depuis un path contenant `.*`.
 * Utilisé pour séparer la partie "tableau" de la partie "champ" dans un wildcard.
 *
 * @param path - Chemin contenant `.*` (ex: `"entries.*.title"`, `"services.*.status"`)
 * @returns Objet { parentPath, field } ou null si pas de wildcard `.*` dans le chemin
 *
 * @example
 * parseWildcardPath('entries.*.title') // → { parentPath: 'entries', field: 'title' }
 * parseWildcardPath('data.items.*.id') // → { parentPath: 'data.items', field: 'id' }
 * parseWildcardPath('status')          // → null (pas de wildcard)
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
 * Génère des Incidents depuis un tableau d'items quand statusPath contient un wildcard.
 *
 * Logique :
 * - Ne génère des incidents QUE si statusPath a un wildcard (ex: `components.*.status`)
 * - Si messagePath a aussi un wildcard (ex: `components.*.name`), il fournit le texte de l'incident
 * - Si messagePath n'a PAS de wildcard, les textes sont traités comme message global (pas des incidents)
 *
 * Pour chaque item du tableau parent :
 * - Le titre est extrait via le champ wildcard de statusPath
 * - Le niveau est déterminé via levelMap puis autoDetectLevel
 * - Le message est extrait via le champ wildcard de messagePath (ou summary/description natifs)
 * - L'URL et la date sont extraits depuis les champs natifs de l'objet (link, updated, pubDate)
 *
 * @param resolved    - Données JSON après résolution (potentiellement converties depuis RSS)
 * @param statusPath  - Chemin du statut (avec ou sans wildcard)
 * @param messagePath - Chemin du message (optionnel, avec ou sans wildcard)
 * @param levelMap    - Table de correspondance pour les niveaux
 * @returns Tableau d'Incidents (vide si statusPath sans wildcard)
 */
function buildIncidents(
  resolved: unknown,
  statusPath: string,
  messagePath: string | undefined,
  levelMap: Record<string, StatusLevel>,
): Incident[] {
  const statusWc = parseWildcardPath(statusPath)

  // Les incidents ne sont générés que si statusPath a un wildcard
  // messagePath wildcard seul = textes explicatifs (MessageEntry), pas des incidents
  if (!statusWc) return []
  const wc = statusWc
  const msgWc = messagePath ? parseWildcardPath(messagePath) : null

  const parentArray = getValueAtPath(resolved, wc.parentPath)
  if (!Array.isArray(parentArray)) return []

  return parentArray
    .map((item, i) => {
      const o = (typeof item === 'object' && item !== null) ? (item as Record<string, unknown>) : {}

      // Titre : champ statusWc.field si disponible, sinon champ natif 'title', sinon champ msgWc
      const titleRaw = statusWc
        ? getValueAtPath(item, statusWc.field)
        : (o.title ?? (msgWc ? getValueAtPath(item, msgWc.field) : undefined))
      const title = toDetectableString(titleRaw)
      if (!title) return null

      // Niveau : d'abord match exact dans levelMap, sinon auto-détection
      const level = levelMap[title] ?? autoDetectLevel(title)

      // Message : champ msgWc.field si disponible, sinon champs natifs summary/description
      const messageRaw = msgWc
        ? getValueAtPath(item, msgWc.field)
        : (o.summary ?? o.description ?? o.message)
      const message = toDetectableString(messageRaw) || undefined

      // Date et URL depuis les champs natifs standards
      const updatedAt = String(o.updated ?? o.pubDate ?? o.date ?? new Date().toISOString())
      const url = typeof o.link === 'string' && o.link ? o.link : undefined

      const incident: Incident = { id: `custom-${i}`, title, level, startedAt: updatedAt, updatedAt }
      // N'ajouter le message que s'il est différent du titre (évite les doublons)
      if (message && message !== title) incident.message = message
      if (url) incident.url = url
      return incident
    })
    .filter((inc): inc is NonNullable<typeof inc> => inc !== null)
}

/**
 * Extrait des MessageEntry structurées depuis un chemin wildcard vers des objets.
 * Utilisé pour alimenter l'onglet "Entrées" dans l'UI (liste informative sans niveau).
 *
 * Supporte deux formes de wildcard :
 * - `entries.*`        : item complet — extrait title, summary, date, url natifs
 * - `entries.*.summary`: un champ spécifique — field est le résumé, title natif si disponible
 *
 * @param resolved - Données JSON après résolution
 * @param msgPath  - Chemin messagePath contenant `.*`
 * @returns Tableau de MessageEntry, ou undefined si le chemin n'est pas un wildcard valide
 *
 * @example
 * // Pour un RSS structuré avec entries.*.summary comme messagePath
 * buildMessageEntries(rssData, 'entries.*.summary')
 * // → [{ title: 'Incident #1', summary: 'Service dégradé', date: '...', url: '...' }, ...]
 */
function buildMessageEntries(resolved: unknown, msgPath: string): import('~/types').MessageEntry[] | undefined {
  // Vérifier que le path contient bien un wildcard
  const isWild = msgPath.includes('.*')
  if (!isWild) return undefined

  // Normaliser "entries.*" (sans champ après) en ajoutant un point final pour parseWildcardPath
  const wc = parseWildcardPath(msgPath + (msgPath.endsWith('.*') ? '.' : ''))
    ?? parseWildcardPath(msgPath)
  if (!wc) return undefined

  const arr = getValueAtPath(resolved, wc.parentPath)
  if (!Array.isArray(arr)) return undefined

  const entries: import('~/types').MessageEntry[] = []
  for (const item of arr) {
    if (item == null) continue
    const o = typeof item === 'object' ? (item as Record<string, unknown>) : {}

    // Si un champ spécifique est ciblé (entries.*.summary) :
    //   - fieldValue = valeur du champ ciblé → c'est le résumé
    //   - title = champ natif 'title' de l'objet, ou le fieldValue si pas de title natif
    // Sinon (entries.*) :
    //   - title = champ natif 'title' ou 'name'
    //   - summary = champ natif summary/description/message
    const fieldValue = wc.field ? toDetectableString(getValueAtPath(item, wc.field)) : ''
    const title = wc.field
      ? (toDetectableString(o.title) || fieldValue)
      : toDetectableString(o.title ?? o.name)
    const summary = wc.field
      ? (fieldValue !== title ? fieldValue : toDetectableString(o.summary ?? o.description))
      : toDetectableString(o.summary ?? o.description ?? o.message)

    // Ignorer les items sans contenu textuel exploitable
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
 * Adapter principal — parse une réponse brute selon un CustomMapping.
 *
 * Pipeline de traitement :
 * 1. `resolveData`      : convertit le XML RSS en JSON navigable si nécessaire
 * 2. `getValueAtPath`   : extrait la valeur brute via statusPath
 * 3. `resolveLevel`     : détermine le StatusLevel (via levelMap + autoDetect + worstLevel si wildcard)
 * 4. `resolveMessage`   : extrait le message textuel via messagePath (ou statusPath en fallback)
 * 5. `buildIncidents`   : génère des Incidents si statusPath contient un wildcard
 * 6. `buildMessageEntries`: génère des MessageEntry si messagePath contient un wildcard
 *
 * @param data    - Données brutes du proxy (JSON parsé ou { _raw: string } pour XML)
 * @param mapping - Configuration du mapping (statusPath, messagePath, levelMap)
 * @returns AdapterResult normalisé
 *
 * @example
 * // API simple avec statut scalaire
 * parseCustom({ status: 'degraded' }, {
 *   statusPath: 'status',
 *   levelMap: { 'degraded': 'mineur', 'healthy': 'operational' }
 * })
 * // → { level: 'mineur', message: 'degraded', incidents: [] }
 *
 * @example
 * // API avec tableau de composants
 * parseCustom({ components: [{ name: 'API', health: 'outage' }] }, {
 *   statusPath: 'components.*.health',
 *   messagePath: 'components.*.name',
 *   levelMap: { 'outage': 'majeur', 'healthy': 'operational' }
 * })
 * // → { level: 'majeur', message: 'API', incidents: [{ title: 'outage', level: 'majeur', ... }] }
 */
export function parseCustom(data: unknown, mapping: CustomMapping): AdapterResult {
  // Étape 1 : convertir RSS/XML en JSON navigable si nécessaire
  const resolved = resolveData(data)

  // Étape 2 & 3 : extraire la valeur de statut et déterminer le niveau
  const rawStatus = getValueAtPath(resolved, mapping.statusPath)
  const level = resolveLevel(rawStatus, mapping.levelMap)

  // Étape 4 : extraire le message (messagePath prioritaire, statusPath en fallback)
  const rawMessage = mapping.messagePath
    ? getValueAtPath(resolved, mapping.messagePath)
    : rawStatus
  const message = resolveMessage(rawMessage) || 'Statut inconnu'

  // Étapes 5 & 6 : construire incidents et entries selon les wildcards détectés
  const incidents = buildIncidents(resolved, mapping.statusPath, mapping.messagePath, mapping.levelMap)
  const entries = mapping.messagePath
    ? buildMessageEntries(resolved, mapping.messagePath)
    : undefined

  return { level, message, incidents, entries }
}
