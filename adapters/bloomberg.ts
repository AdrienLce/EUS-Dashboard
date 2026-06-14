/**
 * @module adapters/bloomberg
 *
 * Adapter for the Bloomberg status page (https://status.bloomberg.com).
 *
 * Bloomberg hosts its status page on the Atlassian Statuspage platform,
 * so the JSON format is identical to the standard Atlassian format.
 *
 * Typical URL: https://status.bloomberg.com/api/v2/summary.json
 *
 * Expected JSON structure:
 * ```json
 * {
 *   "status": { "indicator": "none", "description": "All Systems Operational" },
 *   "incidents": [
 *     {
 *       "id": "abc123",
 *       "name": "Data Feed Latency",
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
 * Mapping of indicators → StatusLevel:
 * - `none`        → operational
 * - `minor`       → leger
 * - `major`       → mineur
 * - `critical`    → majeur
 * - `maintenance` → maintenance
 */

import type { AdapterResult, Incident, StatusLevel } from '~/types'

interface BloombergStatus {
  indicator: string
  description: string
}

interface BloombergIncident {
  id: string
  name: string
  status: string
  impact: string
  shortlink?: string
  updated_at: string
  created_at: string
  incident_updates?: { body: string; updated_at: string }[]
}

interface BloombergSummary {
  status: BloombergStatus
  incidents: BloombergIncident[]
}

function mapIndicator(indicator: string): StatusLevel {
  switch (indicator) {
    case 'none':        return 'operational'
    case 'minor':       return 'leger'
    case 'major':       return 'mineur'
    case 'critical':    return 'majeur'
    case 'maintenance': return 'maintenance'
    default:            return 'inconnu'
  }
}

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

export function parseBloomberg(data: unknown): AdapterResult {
  const summary = data as BloombergSummary

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
