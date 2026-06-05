// Format Atlassian Statuspage (utilisé par Notion, GitHub, etc.)
import type { AdapterResult, Incident, StatusLevel } from '~/types'

interface AtlassianStatus {
  indicator: string
  description: string
}

interface AtlassianIncident {
  id: string
  name: string
  status: string
  impact: string
  shortlink?: string
  updated_at: string
  created_at: string
  incident_updates?: { body: string; updated_at: string }[]
}

interface AtlassianSummary {
  status: AtlassianStatus
  incidents: AtlassianIncident[]
}

function mapIndicator(indicator: string): StatusLevel {
  switch (indicator) {
    case 'none': return 'operational'
    case 'minor': return 'leger'
    case 'major': return 'mineur'
    case 'critical': return 'majeur'
    case 'maintenance': return 'maintenance'
    default: return 'operational'
  }
}

function mapImpact(impact: string): StatusLevel {
  switch (impact) {
    case 'none': return 'operational'
    case 'minor': return 'leger'
    case 'major': return 'mineur'
    case 'critical': return 'majeur'
    case 'maintenance': return 'maintenance'
    default: return 'leger'
  }
}

export function parseAtlassian(data: unknown): AdapterResult {
  const summary = data as AtlassianSummary

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
