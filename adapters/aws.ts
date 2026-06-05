// AWS Health Dashboard JSON feed
import type { AdapterResult, Incident, StatusLevel } from '~/types'

interface AwsEntry {
  service_name: string
  summary: string
  status: string
  date: string
  url: string
}

interface AwsFeed {
  title?: string
  archive_entries?: AwsEntry[]
  current_events?: AwsEntry[]
}

function mapAwsStatus(status: string): StatusLevel {
  const s = status.toLowerCase()
  if (s.includes('operating normally') || s.includes('service is operating normally')) return 'operational'
  if (s.includes('informational')) return 'leger'
  if (s.includes('service degradation') || s.includes('degraded')) return 'mineur'
  if (s.includes('service disruption') || s.includes('disruption')) return 'majeur'
  if (s.includes('maintenance')) return 'maintenance'
  return 'leger'
}

export function parseAws(data: unknown): AdapterResult {
  const feed = data as AwsFeed

  const current = feed.current_events ?? []

  if (current.length === 0) {
    return {
      level: 'operational',
      message: 'Tous les services opérationnels',
      incidents: [],
    }
  }

  const incidents: Incident[] = current.map((entry, i) => ({
    id: `aws-${i}-${entry.date}`,
    title: `[${entry.service_name}] ${entry.summary}`,
    level: mapAwsStatus(entry.status),
    startedAt: entry.date,
    updatedAt: entry.date,
    message: entry.status,
    url: entry.url,
  }))

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
