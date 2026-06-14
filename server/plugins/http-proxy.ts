/**
 * Routes server-side outbound HTTP through a corporate proxy when HTTPS_PROXY /
 * HTTP_PROXY is set in the environment.
 *
 * Node's global `fetch` (undici) ignores the OS / PAC / browser proxy settings.
 * On locked-down networks (e.g. a finance firm) direct egress is firewalled while
 * the browser reaches the internet via the corporate proxy — so the dashboard's
 * status fetches fail with "fetch failed" even though the pages open fine in a
 * browser. Setting HTTPS_PROXY (and restarting) makes the server use the same
 * proxy and resolves it. This is a no-op when no proxy variable is present.
 *
 * NO_PROXY is honoured automatically by EnvHttpProxyAgent.
 */
import { setGlobalDispatcher, EnvHttpProxyAgent } from 'undici'

export default defineNitroPlugin(() => {
  const proxy =
    process.env.HTTPS_PROXY || process.env.https_proxy ||
    process.env.HTTP_PROXY || process.env.http_proxy

  if (!proxy) return

  try {
    setGlobalDispatcher(new EnvHttpProxyAgent())
    console.info(`[http-proxy] Outbound requests routed via proxy: ${proxy}`)
  }
  catch (e) {
    console.warn('[http-proxy] Failed to install proxy dispatcher:', (e as Error).message)
  }
})
