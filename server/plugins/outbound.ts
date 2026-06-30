/**
 * Configures the global outbound HTTP dispatcher for server-side status fetches,
 * for locked-down corporate networks. No-op unless one of the env vars below is set,
 * so it never changes behaviour in a normal environment.
 *
 * Why this exists
 * ---------------
 * Pages that open fine in a browser can fail server-side with:
 *   - "fetch failed" / SELF_SIGNED_CERT_IN_CHAIN  → corporate TLS/SSL inspection:
 *     the firewall re-signs HTTPS with an internal root CA that the browser trusts
 *     (Windows cert store) but Node does not (it ships its own CA bundle).
 *   - ETIMEDOUT / ECONNRESET                       → egress only allowed via a proxy
 *     (Node's fetch ignores the OS/PAC proxy the browser uses).
 *
 * Env vars
 * --------
 *   HTTPS_PROXY / HTTP_PROXY   Route outbound through a corporate proxy (NO_PROXY honoured).
 *   STATUS_CA_FILE             Path to the corporate root CA (PEM). SECURE fix: added to
 *                              Node's default trust store so inspected hosts validate.
 *                              (Equivalent to setting NODE_EXTRA_CA_CERTS before start.)
 *   STATUS_INSECURE_TLS=1      Disable certificate verification for outbound status
 *                              fetches only. QUICK fix — use ONLY on a trusted corporate
 *                              (SSL-inspection) network, never in production.
 */
import fs from 'node:fs'
import { rootCertificates } from 'node:tls'
import { setGlobalDispatcher, EnvHttpProxyAgent, Agent } from 'undici'

export default defineNitroPlugin(() => {
  const proxy =
    process.env.HTTPS_PROXY || process.env.https_proxy ||
    process.env.HTTP_PROXY || process.env.http_proxy
  const caFile = process.env.STATUS_CA_FILE
  const insecureRequested = ['1', 'true', 'yes', 'on'].includes((process.env.STATUS_INSECURE_TLS || '').toLowerCase())
  // Hard refuse to disable TLS verification in production, regardless of the env flag.
  const insecure = insecureRequested && process.env.NODE_ENV !== 'production'
  if (insecureRequested && !insecure) {
    console.warn('[outbound] STATUS_INSECURE_TLS is set but IGNORED in production — certificate verification stays ON.')
  }

  const connect: { rejectUnauthorized?: boolean; ca?: string[] } = {}
  if (caFile) {
    try {
      // Merge the corporate CA with Node's default roots so BOTH inspected and
      // public-cert hosts validate (a bare `ca` would replace the default bundle).
      connect.ca = [...rootCertificates, fs.readFileSync(caFile, 'utf8')]
    }
    catch (e) {
      console.warn(`[outbound] could not read STATUS_CA_FILE (${caFile}):`, (e as Error).message)
    }
  }
  if (insecure) connect.rejectUnauthorized = false

  const hasTls = connect.ca !== undefined || connect.rejectUnauthorized === false
  if (!proxy && !hasTls) return

  try {
    const dispatcher = proxy
      ? new EnvHttpProxyAgent(hasTls ? { connect } : {})
      : new Agent({ connect })
    setGlobalDispatcher(dispatcher)

    const parts = [
      proxy ? `proxy=${proxy}` : null,
      connect.ca ? `ca=${caFile}` : null,
      insecure ? 'TLS verification DISABLED' : null,
    ].filter(Boolean).join(', ')
    console.info(`[outbound] custom dispatcher active (${parts})`)
    if (insecure) {
      console.warn('[outbound] STATUS_INSECURE_TLS is on — certificate verification is OFF. Use only on a trusted corporate network.')
    }
  }
  catch (e) {
    console.warn('[outbound] failed to configure dispatcher:', (e as Error).message)
  }
})
