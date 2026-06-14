/**
 * @module adapters/github
 *
 * Adapter for the GitHub Status API.
 *
 * GitHub uses a variant of the Atlassian Statuspage format enriched with a
 * `components` field listing the platform's components (Git Operations, API, Actions, etc.).
 *
 * URL: https://www.githubstatus.com/api/v2/summary.json
 *
 * Expected JSON structure:
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
 * Note: this adapter does not currently use the `components` field to generate
 * individual incidents — it relies on the `incidents` list like Atlassian.
 * The global `status.indicator` is sufficient for the majority of use cases.
 */

import type { AdapterResult, Incident, StatusLevel } from '~/types'

/** GitHub component with its individual status */
interface GithubComponent {
  id: string
  name: string
  /** Component status: "operational" | "degraded_performance" | "partial_outage" | "major_outage" */
  status: string
  description?: string
}

/** Active GitHub incident */
interface GithubIncident {
  id: string
  name: string
  /** Workflow status: "investigating" | "identified" | "monitoring" | "resolved" */
  status: string
  /** Impact: "none" | "minor" | "major" | "critical" */
  impact: string
  shortlink: string
  updated_at: string
  created_at: string
  /** Incident updates (reverse-chronological order — [0] is the most recent) */
  incident_updates: { body: string; updated_at: string }[]
}

/** Full structure of the GitHub summary.json response */
interface GithubSummary {
  status: { indicator: string; description: string }
  components: GithubComponent[]
  incidents: GithubIncident[]
}

/**
 * Converts the global GitHub indicator into a StatusLevel.
 * Identical mapping to Atlassian (same base format).
 *
 * @param indicator - Value of status.indicator ("none" | "minor" | "major" | "critical" | "maintenance")
 */
function mapGithubIndicator(indicator: string): StatusLevel {
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
 * Converts the impact of a GitHub incident into a StatusLevel.
 *
 * @param impact - Value of incident.impact
 */
function mapGithubIncidentImpact(impact: string): StatusLevel {
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
 * Parses the GitHub Status API response into an AdapterResult.
 *
 * @param data - JSON response parsed from githubstatus.com/api/v2/summary.json
 * @returns AdapterResult with the global level and the list of active incidents
 */
export function parseGithub(data: unknown): AdapterResult {
  const summary = data as GithubSummary

  // Extract and normalize the active incidents
  // The first entry of incident_updates is the most recent update
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
    message: summary.status?.description ?? 'Unknown status',
    incidents,
  }
}
