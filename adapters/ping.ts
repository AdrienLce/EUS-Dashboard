import type { AdapterResult } from '~/types'

export interface PingData {
  _statusCode: number
  _ok: boolean
}

export function parsePing(data: unknown): AdapterResult {
  const d = data as PingData
  const code = d._statusCode ?? 0

  if (d._ok || (code >= 200 && code < 300)) {
    return {
      level: 'operational',
      message: `HTTP ${code}`,
      incidents: [],
    }
  }

  if (code === 401 || code === 403) {
    return {
      level: 'inconnu',
      message: `HTTP ${code} — authentication required`,
      incidents: [],
    }
  }

  if (code === 429 || code === 502 || code === 503 || code === 504) {
    return {
      level: 'mineur',
      message: `HTTP ${code}`,
      incidents: [{ id: '1', name: `HTTP ${code}`, level: 'mineur', status: 'ongoing', impact: 'minor', createdAt: new Date().toISOString() }],
    }
  }

  if (code >= 500) {
    return {
      level: 'majeur',
      message: `HTTP ${code} — server error`,
      incidents: [{ id: '1', name: `HTTP server error ${code}`, level: 'majeur', status: 'ongoing', impact: 'critical', createdAt: new Date().toISOString() }],
    }
  }

  if (code >= 400) {
    return {
      level: 'mineur',
      message: `HTTP ${code}`,
      incidents: [{ id: '1', name: `HTTP ${code}`, level: 'mineur', status: 'ongoing', impact: 'minor', createdAt: new Date().toISOString() }],
    }
  }

  // No response (timeout, network)
  return {
    level: 'majeur',
    message: code === 0 ? 'No response (timeout or network)' : `HTTP ${code}`,
    incidents: [],
  }
}
