import type { AdapterResult, Incident, StatusLevel } from '~/types'

interface GithubComponent {
  id: string
  name: string
  status: string
  description?: string
}

interface GithubIncident {
  id: string
  name: string
  status: string
  impact: string
  shortlink: string
  updated_at: string
  created_at: string
  incident_updates: { body: string; updated_at: string }[]
}

interface GithubSummary {
  status: { indicator: string; description: string }
  components: GithubComponent[]
  incidents: GithubIncident[]
}

function mapGithubIndicator(indicator: string): StatusLevel {
  switch (indicator) {
    case 'none': return 'operational'
    case 'minor': return 'leger'
    case 'major': return 'mineur'
    case 'critical': return 'majeur'
    case 'maintenance': return 'maintenance'
    default: return 'operational'
  }
}

function mapGithubIncidentImpact(impact: string): StatusLevel {
  switch (impact) {
    case 'none': return 'operational'
    case 'minor': return 'leger'
    case 'major': return 'mineur'
    case 'critical': return 'majeur'
    case 'maintenance': return 'maintenance'
    default: return 'leger'
  }
}

export function parseGithub(data: unknown): AdapterResult {
  const summary = data as GithubSummary

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
