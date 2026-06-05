import { defineEventHandler, readBody, createError } from 'h3'

interface ProxyRequest {
  url: string
  method: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: string
}

export default defineEventHandler(async (event) => {
  const req = await readBody<ProxyRequest>(event)

  if (!req?.url) {
    throw createError({ statusCode: 400, message: 'URL manquante' })
  }

  try {
    const url = new URL(req.url)

    // Sécurité : bloquer appels vers localhost/réseau privé depuis le proxy
    const hostname = url.hostname
    if (
      hostname === 'localhost'
      || hostname === '127.0.0.1'
      || hostname === '0.0.0.0'
      || hostname.startsWith('192.168.')
      || hostname.startsWith('10.')
    ) {
      throw createError({ statusCode: 403, message: 'Accès réseau privé interdit' })
    }
  }
  catch (e: unknown) {
    if ((e as { statusCode?: number }).statusCode) throw e
    throw createError({ statusCode: 400, message: 'URL invalide' })
  }

  const fetchOptions: RequestInit = {
    method: req.method ?? 'GET',
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'StatusDashboard/1.0',
      ...(req.headers ?? {}),
    },
  }

  if (req.method === 'POST' && req.body) {
    fetchOptions.body = req.body
    ;(fetchOptions.headers as Record<string, string>)['Content-Type'] = 'application/json'
  }

  const response = await fetch(req.url, fetchOptions)

  if (!response.ok) {
    throw createError({
      statusCode: response.status,
      message: `Erreur HTTP ${response.status} depuis ${req.url}`,
    })
  }

  const contentType = response.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    return await response.json()
  }

  // Retourner le texte brut (RSS, XML, etc.)
  return { _raw: await response.text() }
})
