// Azure DevOps Health API — format réel observé
import type { AdapterResult, Incident, StatusLevel } from '~/types'

interface AzureDevOpsGeography {
  id: string
  name: string
  health: string
}

interface AzureDevOpsService {
  id: string
  displayName?: string
  geographies: AzureDevOpsGeography[]
  issues?: {
    id: string
    title: string
    state?: string
    severity?: string
    startTime?: string
    lastUpdatedTime?: string
    isDisruptive?: boolean
    sourceLink?: string
  }[]
}

interface AzureDevOpsResponse {
  lastUpdated?: string
  status: {
    health: string
    message: string
  }
  services: AzureDevOpsService[]
}

function mapHealth(health: string): StatusLevel {
  switch ((health ?? '').toLowerCase()) {
    case 'healthy': return 'operational'
    case 'advisory': return 'leger'
    case 'degraded': return 'mineur'
    case 'unhealthy': return 'majeur'
    case 'maintenance': return 'maintenance'
    default: return 'operational'
  }
}

export function parseAzureDevOps(data: unknown): AdapterResult {
  const resp = data as AzureDevOpsResponse

  const globalHealth = resp.status?.health ?? 'healthy'
  const globalMessage = resp.status?.message ?? 'Statut inconnu'

  const incidents: Incident[] = []
  const updatedAt = resp.lastUpdated ?? new Date().toISOString()

  for (const svc of resp.services ?? []) {
    const name = svc.displayName ?? svc.id

    // Incidents explicites (si présents dans une réponse future)
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

    // Géographies dégradées sans issue explicite
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
