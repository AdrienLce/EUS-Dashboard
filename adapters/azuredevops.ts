/**
 * @module adapters/azuredevops
 *
 * Adapter pour l'API Azure DevOps Health.
 *
 * Azure DevOps expose une API de santé qui retourne l'état global et par service/géographie.
 *
 * URL type : https://status.dev.azure.com/_apis/status/health?geographies=EU&api-version=7.0-preview.1
 *
 * Structure JSON attendue :
 * ```json
 * {
 *   "lastUpdated": "2024-01-15T10:00:00Z",
 *   "status": { "health": "healthy", "message": "Azure DevOps is healthy" },
 *   "services": [
 *     {
 *       "id": "Boards",
 *       "displayName": "Boards",
 *       "geographies": [
 *         { "id": "EU", "name": "West Europe", "health": "healthy" }
 *       ],
 *       "issues": [
 *         {
 *           "id": "issue-123",
 *           "title": "Connectivity issue",
 *           "state": "active",
 *           "severity": "degraded",
 *           "startTime": "...",
 *           "lastUpdatedTime": "...",
 *           "isDisruptive": true,
 *           "sourceLink": "https://..."
 *         }
 *       ]
 *     }
 *   ]
 * }
 * ```
 *
 * Mapping santé Azure DevOps → StatusLevel :
 * - `healthy`     → operational
 * - `advisory`    → leger
 * - `degraded`    → mineur
 * - `unhealthy`   → majeur
 * - `maintenance` → maintenance
 */

import type { AdapterResult, Incident, StatusLevel } from '~/types'

/** État de santé d'une géographie dans la réponse Azure DevOps */
interface AzureDevOpsGeography {
  /** Code identifiant la géographie (ex: "EU", "US") */
  id: string
  /** Nom complet (ex: "West Europe") */
  name: string
  /** Santé de cette zone géographique */
  health: string
}

/** Service Azure DevOps (Boards, Repos, Pipelines, etc.) */
interface AzureDevOpsService {
  /** Identifiant technique du service */
  id: string
  /** Nom affiché (ex: "Boards", "Repos", "Pipelines") */
  displayName?: string
  /** État par zone géographique */
  geographies: AzureDevOpsGeography[]
  /** Incidents explicitement déclarés (peut être absent) */
  issues?: {
    id: string
    title: string
    /** État de l'issue : "active" | "resolved" */
    state?: string
    /** Sévérité : "degraded" | "unhealthy" | "advisory" */
    severity?: string
    startTime?: string
    lastUpdatedTime?: string
    isDisruptive?: boolean
    sourceLink?: string
  }[]
}

/** Structure complète de la réponse de l'API Azure DevOps Health */
interface AzureDevOpsResponse {
  /** Horodatage de la dernière mise à jour du statut */
  lastUpdated?: string
  /** Statut global consolidé */
  status: {
    /** Santé globale : "healthy" | "advisory" | "degraded" | "unhealthy" | "maintenance" */
    health: string
    /** Message descriptif global */
    message: string
  }
  /** Liste des services avec leur état détaillé */
  services: AzureDevOpsService[]
}

/**
 * Convertit une valeur de santé Azure DevOps en StatusLevel.
 * Utilisé à la fois pour le statut global, les géographies et les sévérités d'issues.
 *
 * @param health - Valeur du champ health/severity
 * @returns StatusLevel correspondant
 */
function mapHealth(health: string): StatusLevel {
  switch ((health ?? '').toLowerCase()) {
    case 'healthy':     return 'operational'
    case 'advisory':    return 'leger'
    case 'degraded':    return 'mineur'
    case 'unhealthy':   return 'majeur'
    case 'maintenance': return 'maintenance'
    default:            return 'operational'
  }
}

/**
 * Parse la réponse de l'API Azure DevOps Health en AdapterResult.
 *
 * Deux sources d'incidents sont explorées pour chaque service :
 * 1. Issues explicites (champ `issues`) : incidents déclarés officiellement
 * 2. Géographies dégradées sans issue explicite : zones en échec mais non déclarées en incident
 *    (cette situation peut arriver lors de problèmes régionaux non encore formalisés)
 *
 * @param data - Réponse JSON parsée depuis l'API Azure DevOps Health
 * @returns AdapterResult avec le niveau global et la liste des incidents
 */
export function parseAzureDevOps(data: unknown): AdapterResult {
  const resp = data as AzureDevOpsResponse

  const globalHealth = resp.status?.health ?? 'healthy'
  const globalMessage = resp.status?.message ?? 'Statut inconnu'

  const incidents: Incident[] = []
  const updatedAt = resp.lastUpdated ?? new Date().toISOString()

  for (const svc of resp.services ?? []) {
    const name = svc.displayName ?? svc.id

    // Source 1 : incidents explicitement déclarés dans le champ issues
    for (const issue of svc.issues ?? []) {
      incidents.push({
        id: issue.id,
        title: `[${name}] ${issue.title}`,
        level: mapHealth(issue.severity ?? 'degraded'),
        startedAt: issue.startTime ?? updatedAt,
        updatedAt: issue.lastUpdatedTime ?? updatedAt,
        url: issue.sourceLink,
      })
    }

    // Source 2 : géographies non-saines SANS issue explicite associée
    // Représente des problèmes régionaux détectés mais pas encore formalisés en incident
    for (const geo of svc.geographies ?? []) {
      if (geo.health !== 'healthy' && (svc.issues ?? []).length === 0) {
        incidents.push({
          id: `${svc.id}-${geo.id}`,
          title: `[${name}] ${geo.name} — ${geo.health}`,
          level: mapHealth(geo.health),
          startedAt: updatedAt,
          updatedAt,
        })
      }
    }
  }

  return {
    level: mapHealth(globalHealth),
    message: globalMessage,
    incidents,
  }
}
