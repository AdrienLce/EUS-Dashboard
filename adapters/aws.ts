/**
 * @module adapters/aws
 *
 * Adapter for the AWS Health Dashboard JSON feed.
 *
 * AWS exposes a JSON feed listing the ongoing events affecting its services.
 *
 * URL: https://health.aws.amazon.com/health/status
 *
 * Expected JSON structure:
 * ```json
 * {
 *   "title": "Amazon Web Services Service Health Dashboard",
 *   "current_events": [
 *     {
 *       "service_name": "Amazon EC2",
 *       "summary": "Increased error rates in the EU-WEST-1 region",
 *       "status": "Service is operating normally",
 *       "date": "2024-01-15T10:00:00Z",
 *       "url": "https://health.aws.amazon.com/health/status#..."
 *     }
 *   ],
 *   "archive_entries": [ ... ]
 * }
 * ```
 *
 * Parsing logic:
 * - If `current_events` is empty → `operational`
 * - Otherwise → each event is an Incident, and the global level is the worst level among them
 */

import type { AdapterResult, Incident, StatusLevel } from '~/types'

/** Structure of an event in the AWS Health feed */
interface AwsEntry {
  /** Name of the AWS service (e.g. "Amazon EC2", "AWS Lambda") */
  service_name: string
  /** Short description of the event */
  summary: string
  /** Textual event status (free-form English sentence) */
  status: string
  /** ISO 8601 event date */
  date: string
  /** URL to the detail page on the Health Dashboard */
  url: string
}

/** Full structure of the AWS Health JSON feed */
interface AwsFeed {
  title?: string
  /** Archived (past) events — not used by this adapter */
  archive_entries?: AwsEntry[]
  /** Currently active events */
  current_events?: AwsEntry[]
}

/**
 * Converts the AWS textual status (free-form sentence) into a StatusLevel.
 * AWS uses full sentences rather than short codes.
 *
 * @param status - Text of the "status" field (e.g. "Service is operating normally")
 * @returns StatusLevel inferred by substring matching
 */
function mapAwsStatus(status: string): StatusLevel {
  const s = status.toLowerCase()
  if (s.includes('operating normally') || s.includes('service is operating normally')) return 'operational'
  if (s.includes('informational')) return 'leger'
  if (s.includes('service degradation') || s.includes('degraded')) return 'mineur'
  if (s.includes('service disruption') || s.includes('disruption')) return 'majeur'
  if (s.includes('maintenance')) return 'maintenance'
  // Conservative default: an event is present but its status is unknown → minor disruption
  return 'leger'
}

/**
 * Parses the AWS Health Dashboard JSON feed into an AdapterResult.
 *
 * @param data - JSON response parsed from health.aws.amazon.com/health/status
 * @returns AdapterResult with the global level and the list of active events
 */
export function parseAws(data: unknown): AdapterResult {
  // The health.aws.amazon.com/health/status URL returns HTML (SPA) — the proxy wraps it
  // in { _raw } instead of parsing JSON. We detect this case to avoid a false "operational".
  if (typeof data === 'object' && data !== null && '_raw' in data) {
    return {
      level: 'inconnu',
      message: "Réponse non-JSON reçue — vérifier l'URL du feed AWS",
      incidents: [],
    }
  }

  const feed = data as AwsFeed

  // Supports both field names: "current_events" (new API) and "current" (old data.json)
  const current = feed.current_events ?? (feed as Record<string, unknown>).current as AwsEntry[] ?? []

  // No ongoing events → everything is operational
  if (current.length === 0) {
    return {
      level: 'operational',
      message: 'Tous les services opérationnels',
      incidents: [],
    }
  }

  // Transform each event into a normalized Incident
  // The title includes the service name to quickly identify the affected component
  const incidents: Incident[] = current.map((entry, i) => ({
    id: `aws-${i}-${entry.date}`,
    title: `[${entry.service_name}] ${entry.summary}`,
    level: mapAwsStatus(entry.status),
    startedAt: entry.date,
    updatedAt: entry.date,
    message: entry.status,
    url: entry.url,
  }))

  // Compute the global level = the worst level among all incidents
  const worstLevel = incidents.reduce<StatusLevel>((worst, inc) => {
    const order: StatusLevel[] = ['operational', 'maintenance', 'leger', 'mineur', 'majeur']
    return order.indexOf(inc.level) > order.indexOf(worst) ? inc.level : worst
  }, 'operational')

  return {
    level: worstLevel,
    message: `${current.length} événement(s) en cours`,
    incidents,
  }
}
