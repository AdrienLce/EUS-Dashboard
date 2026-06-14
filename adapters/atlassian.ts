/**
 * @module adapters/atlassian
 *
 * Adapter for the Atlassian Statuspage API.
 *
 * Format used by many SaaS services: Notion, Atlassian (Jira, Confluence),
 * and any service hosted on statuspage.io.
 *
 * Typical URL: https://{service}.statuspage.io/api/v2/summary.json
 *
 * Expected JSON structure:
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
 * Mapping of Atlassian indicators → StatusLevel:
 * - `none`        → operational
 * - `minor`       → leger
 * - `major`       → mineur
 * - `critical`    → majeur
 * - `maintenance` → maintenance
 */

import type { AdapterResult, Incident, StatusLevel } from '~/types'
import { worstLevel } from '~/types'

/** Structure of the status.indicator field in the Atlassian response */
interface AtlassianStatus {
  /** Global impact level: "none" | "minor" | "major" | "critical" | "maintenance" */
  indicator: string
  /** Textual description of the global status (e.g. "All Systems Operational") */
  description: string
}

/** Structure of an incident in the Atlassian response */
interface AtlassianIncident {
  /** Unique incident identifier (provided by Statuspage) */
  id: string
  /** Incident title */
  name: string
  /** Workflow status: "investigating" | "identified" | "monitoring" | "resolved" */
  status: string
  /** User-facing impact: "none" | "minor" | "major" | "critical" | "maintenance" */
  impact: string
  /** Short URL to the detail page */
  shortlink?: string
  /** ISO 8601 last-updated timestamp */
  updated_at: string
  /** ISO 8601 creation timestamp */
  created_at: string
  /** History of incident updates (reverse-chronological order) */
  incident_updates?: { body: string; updated_at: string }[]
}

/** Full structure of the summary.json response */
interface AtlassianSummary {
  status: AtlassianStatus
  incidents: AtlassianIncident[]
}

/**
 * Converts a global Atlassian indicator into a StatusLevel.
 * The global indicator reflects the worst active level across all components.
 *
 * @param indicator - Value of the status.indicator field
 * @returns The corresponding StatusLevel
 */
function mapIndicator(indicator: string): StatusLevel {
  switch (indicator) {
    case 'none':        return 'operational'
    case 'minor':       return 'mineur'
    case 'major':       return 'majeur'
    case 'critical':    return 'critique'
    case 'maintenance': return 'maintenance'
    default:            return 'operational'
  }
}

/**
 * Converts an Atlassian incident impact into a StatusLevel.
 * The impact is per-incident, unlike the indicator which is global.
 *
 * @param impact - Value of the incident.impact field
 * @returns The corresponding StatusLevel (default: "leger" for unknown impacts)
 */
function mapImpact(impact: string): StatusLevel {
  switch (impact) {
    case 'none':        return 'operational'
    case 'minor':       return 'mineur'
    case 'major':       return 'majeur'
    case 'critical':    return 'critique'
    case 'maintenance': return 'maintenance'
    default:            return 'mineur'
  }
}

/**
 * Parses the Atlassian Statuspage API response into an AdapterResult.
 *
 * @param data - JSON response parsed from summary.json
 * @returns AdapterResult with the global level and the list of active incidents
 */
export function parseAtlassian(data: unknown): AdapterResult {
  const summary = data as AtlassianSummary

  // Convert each incident into the normalized format
  // The incident message is the latest update (incident_updates[0])
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
    message: summary.status?.description ?? 'Unknown status',
    incidents,
  }
}
