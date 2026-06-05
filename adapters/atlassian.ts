/**
 * @module adapters/atlassian
 *
 * Adapter pour l'API Atlassian Statuspage.
 *
 * Format utilisé par de nombreux services SaaS : Notion, Atlassian (Jira, Confluence),
 * et tout service hébergé sur statuspage.io.
 *
 * URL type : https://{service}.statuspage.io/api/v2/summary.json
 *
 * Structure JSON attendue :
 * ```json
 * {
 *   "status": { "indicator": "none", "description": "All Systems Operational" },
 *   "incidents": [
 *     {
 *       "id": "abc123",
 *       "name": "API Latency",
 *       "status": "investigating",
 *       "impact": "minor",
 *       "shortlink": "https://stspg.io/abc123",
 *       "created_at": "2024-01-15T10:00:00Z",
 *       "updated_at": "2024-01-15T10:30:00Z",
 *       "incident_updates": [{ "body": "We are investigating...", "updated_at": "..." }]
 *     }
 *   ]
 * }
 * ```
 *
 * Mapping des indicateurs Atlassian → StatusLevel :
 * - `none`        → operational
 * - `minor`       → leger
 * - `major`       → mineur
 * - `critical`    → majeur
 * - `maintenance` → maintenance
 */

import type { AdapterResult, Incident, StatusLevel } from '~/types'

/** Structure du champ status.indicator dans la réponse Atlassian */
interface AtlassianStatus {
  /** Niveau d'impact global : "none" | "minor" | "major" | "critical" | "maintenance" */
  indicator: string
  /** Description textuelle du statut global (ex: "All Systems Operational") */
  description: string
}

/** Structure d'un incident dans la réponse Atlassian */
interface AtlassianIncident {
  /** Identifiant unique de l'incident (fourni par Statuspage) */
  id: string
  /** Titre de l'incident */
  name: string
  /** Statut du workflow : "investigating" | "identified" | "monitoring" | "resolved" */
  status: string
  /** Impact sur les utilisateurs : "none" | "minor" | "major" | "critical" | "maintenance" */
  impact: string
  /** URL courte vers la page de détail */
  shortlink?: string
  /** Horodatage de dernière mise à jour ISO 8601 */
  updated_at: string
  /** Horodatage de création ISO 8601 */
  created_at: string
  /** Historique des mises à jour de l'incident (ordre antéchronologique) */
  incident_updates?: { body: string; updated_at: string }[]
}

/** Structure complète de la réponse summary.json */
interface AtlassianSummary {
  status: AtlassianStatus
  incidents: AtlassianIncident[]
}

/**
 * Convertit un indicateur global Atlassian en StatusLevel.
 * L'indicateur global reflète le pire niveau actif sur l'ensemble des composants.
 *
 * @param indicator - Valeur du champ status.indicator
 * @returns StatusLevel correspondant
 */
function mapIndicator(indicator: string): StatusLevel {
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
 * Convertit un impact d'incident Atlassian en StatusLevel.
 * L'impact est par incident, contrairement à l'indicateur qui est global.
 *
 * @param impact - Valeur du champ incident.impact
 * @returns StatusLevel correspondant (défaut: "leger" pour les impacts inconnus)
 */
function mapImpact(impact: string): StatusLevel {
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
 * Parse la réponse de l'API Atlassian Statuspage en AdapterResult.
 *
 * @param data - Réponse JSON parsée depuis summary.json
 * @returns AdapterResult avec le niveau global et la liste des incidents actifs
 */
export function parseAtlassian(data: unknown): AdapterResult {
  const summary = data as AtlassianSummary

  // Convertir chaque incident en format normalisé
  // Le message de l'incident est la dernière mise à jour (incident_updates[0])
  const incidents: Incident[] = (summary.incidents ?? []).map((inc) => ({
    id: inc.id,
    title: inc.name,
    level: mapImpact(inc.impact),
    startedAt: inc.created_at,
    updatedAt: inc.updated_at,
    message: inc.incident_updates?.[0]?.body,
    url: inc.shortlink,
  }))

  return {
    level: mapIndicator(summary.status?.indicator ?? 'none'),
    message: summary.status?.description ?? 'Statut inconnu',
    incidents,
  }
}
