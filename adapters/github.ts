/**
 * @module adapters/github
 *
 * Adapter pour l'API GitHub Status.
 *
 * GitHub utilise une variante du format Atlassian Statuspage enrichie d'un champ
 * `components` listant les composants de la plateforme (Git Operations, API, Actions, etc.).
 *
 * URL : https://www.githubstatus.com/api/v2/summary.json
 *
 * Structure JSON attendue :
 * ```json
 * {
 *   "status": { "indicator": "none", "description": "All Systems Operational" },
 *   "components": [
 *     { "id": "...", "name": "Git Operations", "status": "operational" }
 *   ],
 *   "incidents": [
 *     {
 *       "id": "...", "name": "Incident title", "impact": "minor",
 *       "shortlink": "https://...", "created_at": "...", "updated_at": "...",
 *       "incident_updates": [{ "body": "Update text...", "updated_at": "..." }]
 *     }
 *   ]
 * }
 * ```
 *
 * Note : cet adapter n'utilise pas actuellement le champ `components` pour générer
 * des incidents individuels — il se base sur la liste `incidents` comme Atlassian.
 * L'indicateur global `status.indicator` suffit pour la majorité des cas d'usage.
 */

import type { AdapterResult, Incident, StatusLevel } from '~/types'

/** Composant GitHub avec son statut individuel */
interface GithubComponent {
  id: string
  name: string
  /** Statut du composant : "operational" | "degraded_performance" | "partial_outage" | "major_outage" */
  status: string
  description?: string
}

/** Incident GitHub actif */
interface GithubIncident {
  id: string
  name: string
  /** Statut du workflow : "investigating" | "identified" | "monitoring" | "resolved" */
  status: string
  /** Impact : "none" | "minor" | "major" | "critical" */
  impact: string
  shortlink: string
  updated_at: string
  created_at: string
  /** Mises à jour de l'incident (ordre antéchronologique — [0] est la plus récente) */
  incident_updates: { body: string; updated_at: string }[]
}

/** Structure complète de la réponse summary.json GitHub */
interface GithubSummary {
  status: { indicator: string; description: string }
  components: GithubComponent[]
  incidents: GithubIncident[]
}

/**
 * Convertit l'indicateur global GitHub en StatusLevel.
 * Mapping identique à Atlassian (même format de base).
 *
 * @param indicator - Valeur de status.indicator ("none" | "minor" | "major" | "critical" | "maintenance")
 */
function mapGithubIndicator(indicator: string): StatusLevel {
  switch (indicator) {
    case 'none':        return 'operational'
    case 'minor':       return 'leger'
    case 'major':       return 'mineur'
    case 'critical':    return 'majeur'
    case 'maintenance': return 'maintenance'
    default:            return 'operational'
  }
}

/**
 * Convertit l'impact d'un incident GitHub en StatusLevel.
 *
 * @param impact - Valeur de incident.impact
 */
function mapGithubIncidentImpact(impact: string): StatusLevel {
  switch (impact) {
    case 'none':        return 'operational'
    case 'minor':       return 'leger'
    case 'major':       return 'mineur'
    case 'critical':    return 'majeur'
    case 'maintenance': return 'maintenance'
    default:            return 'leger'
  }
}

/**
 * Parse la réponse de l'API GitHub Status en AdapterResult.
 *
 * @param data - Réponse JSON parsée depuis githubstatus.com/api/v2/summary.json
 * @returns AdapterResult avec le niveau global et la liste des incidents actifs
 */
export function parseGithub(data: unknown): AdapterResult {
  const summary = data as GithubSummary

  // Extraire et normaliser les incidents actifs
  // La première entrée de incident_updates est la mise à jour la plus récente
  const incidents: Incident[] = (summary.incidents ?? []).map((inc) => ({
    id: inc.id,
    title: inc.name,
    level: mapGithubIncidentImpact(inc.impact),
    startedAt: inc.created_at,
    updatedAt: inc.updated_at,
    message: inc.incident_updates?.[0]?.body,
    url: inc.shortlink,
  }))

  return {
    level: mapGithubIndicator(summary.status?.indicator ?? 'none'),
    message: summary.status?.description ?? 'Statut inconnu',
    incidents,
  }
}
