/**
 * @module adapters/azuredevops
 *
 * Adapter for the Azure DevOps Health API.
 *
 * Azure DevOps exposes a health API that returns the global state as well as the state per service/geography.
 *
 * Typical URL: https://status.dev.azure.com/_apis/status/health?geographies=EU&api-version=7.0-preview.1
 *
 * Expected JSON structure:
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
 * Azure DevOps health mapping → StatusLevel:
 * - `healthy`     → operational
 * - `advisory`    → leger
 * - `degraded`    → mineur
 * - `unhealthy`   → majeur
 * - `maintenance` → maintenance
 */

import type { AdapterResult, Incident, StatusLevel } from '~/types'

/** Health state of a geography in the Azure DevOps response */
interface AzureDevOpsGeography {
  /** Code identifying the geography (e.g. "EU", "US") */
  id: string
  /** Full name (e.g. "West Europe") */
  name: string
  /** Health of this geographic area */
  health: string
}

/** Azure DevOps service (Boards, Repos, Pipelines, etc.) */
interface AzureDevOpsService {
  /** Technical service identifier */
  id: string
  /** Displayed name (e.g. "Boards", "Repos", "Pipelines") */
  displayName?: string
  /** State per geographic area */
  geographies: AzureDevOpsGeography[]
  /** Explicitly declared incidents (may be absent) */
  issues?: {
    id: string
    title: string
    /** Issue state: "active" | "resolved" */
    state?: string
    /** Severity: "degraded" | "unhealthy" | "advisory" */
    severity?: string
    startTime?: string
    lastUpdatedTime?: string
    isDisruptive?: boolean
    sourceLink?: string
  }[]
}

/** Full structure of the Azure DevOps Health API response */
interface AzureDevOpsResponse {
  /** Timestamp of the last status update */
  lastUpdated?: string
  /** Consolidated global status */
  status: {
    /** Global health: "healthy" | "advisory" | "degraded" | "unhealthy" | "maintenance" */
    health: string
    /** Global descriptive message */
    message: string
  }
  /** List of services with their detailed state */
  services: AzureDevOpsService[]
}

/**
 * Converts an Azure DevOps health value into a StatusLevel.
 * Used for the global status, the geographies, and the issue severities alike.
 *
 * @param health - Value of the health/severity field
 * @returns The corresponding StatusLevel
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
 * Parses the Azure DevOps Health API response into an AdapterResult.
 *
 * Two sources of incidents are explored for each service:
 * 1. Explicit issues (the `issues` field): officially declared incidents
 * 2. Degraded geographies without an explicit issue: areas in failure but not declared as an incident
 *    (this situation can occur during regional problems that have not yet been formalized)
 *
 * @param data - JSON response parsed from the Azure DevOps Health API
 * @returns AdapterResult with the global level and the list of incidents
 */
export function parseAzureDevOps(data: unknown): AdapterResult {
  const resp = data as AzureDevOpsResponse

  const globalHealth = resp.status?.health ?? 'healthy'
  const globalMessage = resp.status?.message ?? 'Statut inconnu'

  const incidents: Incident[] = []
  const updatedAt = resp.lastUpdated ?? new Date().toISOString()

  for (const svc of resp.services ?? []) {
    const name = svc.displayName ?? svc.id

    // Source 1: incidents explicitly declared in the issues field
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

    // Source 2: unhealthy geographies WITHOUT an associated explicit issue
    // Represents regional problems that have been detected but not yet formalized as an incident
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
