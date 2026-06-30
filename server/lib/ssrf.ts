/**
 * @module server/lib/ssrf
 *
 * Shared SSRF guard for every server-side outbound fetch (scheduler poll + /api/proxy).
 *
 * Hostname / IP-literal based — it does NOT resolve DNS (a synchronous resolve isn't
 * available here and would add latency to every poll). It blocks the obvious private,
 * loopback and link-local literals, including the cloud metadata address
 * (169.254.169.254) which is the classic SSRF target on AWS/GCP/Azure.
 *
 * Configs are user-supplied through the UI, so this runs on the live polling path too,
 * not just the manual proxy.
 */

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '0.0.0.0',
  '::',
  '::1',
  'ip6-localhost',
  'ip6-loopback',
])

function isPrivateIPv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return false
  const a = Number(m[1])
  const b = Number(m[2])
  if (a === 0) return true                          // 0.0.0.0/8 ("this network")
  if (a === 10) return true                         // 10.0.0.0/8 private
  if (a === 127) return true                        // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true           // 169.254.0.0/16 link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true  // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true           // 192.168.0.0/16 private
  return false
}

/** True if the hostname targets a private / loopback / link-local address. */
export function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '') // strip IPv6 brackets
  if (BLOCKED_HOSTNAMES.has(h)) return true
  if (isPrivateIPv4(h)) return true
  if (h.startsWith('fc') || h.startsWith('fd')) return true // fc00::/7 unique-local IPv6
  if (h.startsWith('fe80')) return true                     // fe80::/10 link-local IPv6
  return false
}

/**
 * Validates a URL for outbound use. Throws an Error (with a `statusCode` property)
 * if the URL is malformed or targets a private/loopback/link-local host.
 */
export function assertPublicUrl(rawUrl: string): URL {
  let url: URL
  try {
    url = new URL(rawUrl)
  }
  catch {
    throw Object.assign(new Error('Invalid URL'), { statusCode: 400 })
  }
  if (isBlockedHost(url.hostname)) {
    throw Object.assign(new Error('Private network access forbidden'), { statusCode: 403 })
  }
  return url
}
