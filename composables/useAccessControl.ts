/**
 * @module composables/useAccessControl
 * Manages access protection for the /services page.
 * Modes: none | password (SHA-256) | sso (OIDC PKCE)
 */

export type AccessMode = 'none' | 'password' | 'sso'

const SESSION_KEY = 'status-access-granted'
const LS_CONFIG_KEY = 'status-access-config'

const accessConfig = ref<{
  mode: AccessMode
  passwordHash?: string
  ssoDiscoveryUrl?: string
  ssoClientId?: string
  ssoRedirectUri?: string
}>({ mode: 'none' })

const granted = ref(false)

// ── Session ──────────────────────────────────────────────────

function loadSession() {
  if (!import.meta.client) return
  granted.value = sessionStorage.getItem(SESSION_KEY) === '1'
  try {
    const saved = localStorage.getItem(LS_CONFIG_KEY)
    if (saved) accessConfig.value = JSON.parse(saved)
  }
  catch { /* silent */ }
}

function saveConfig() {
  if (!import.meta.client) return
  localStorage.setItem(LS_CONFIG_KEY, JSON.stringify(accessConfig.value))
  // Sync via useServerConfig for consistency with the global storage
  $fetch('/api/config', { method: 'POST', body: { accessControl: accessConfig.value } }).catch(() => {})
}

/** Loads the config from the server (called by useServerConfig after load) */
function loadFromServer(cfg: unknown) {
  if (!cfg) return
  try { Object.assign(accessConfig.value, cfg) } catch { /* silent */ }
}

// ── Password ─────────────────────────────────────────────────

async function hashPassword(password: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function checkPassword(input: string): Promise<boolean> {
  if (!accessConfig.value.passwordHash) return true
  const ok = await hashPassword(input) === accessConfig.value.passwordHash
  if (ok) { sessionStorage.setItem(SESSION_KEY, '1'); granted.value = true }
  return ok
}

// ── SSO / OIDC PKCE ──────────────────────────────────────────

/** Generates a random string of length n for the PKCE code_verifier */
function randomString(n: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  const arr = crypto.getRandomValues(new Uint8Array(n))
  return Array.from(arr).map(b => chars[b % chars.length]).join('')
}

/** Encodes to Base64URL (without padding) */
function base64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

/**
 * Starts the OIDC PKCE flow:
 * 1. Fetches the discovery document via the server proxy
 * 2. Generates code_verifier + code_challenge
 * 3. Stores the parameters in sessionStorage
 * 4. Redirects to the authorization endpoint
 */
async function initiateSSO(returnTo = '/services') {
  if (!import.meta.client) return
  const { ssoDiscoveryUrl, ssoClientId } = accessConfig.value
  if (!ssoDiscoveryUrl || !ssoClientId) throw new Error('SSO non configuré')

  // 1. Discovery
  const discovery = await $fetch<{
    authorization_endpoint: string
    token_endpoint: string
  }>(`/api/sso/discover?url=${encodeURIComponent(ssoDiscoveryUrl)}`)

  // 2. PKCE
  const verifier = randomString(64)
  const challengeBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  const challenge = base64url(challengeBuffer)

  const redirectUri = accessConfig.value.ssoRedirectUri
    || `${window.location.origin}/auth/callback`

  // 3. Store before redirecting
  sessionStorage.setItem('pkce_verifier', verifier)
  sessionStorage.setItem('sso_token_endpoint', discovery.token_endpoint)
  sessionStorage.setItem('sso_client_id', ssoClientId)
  sessionStorage.setItem('sso_return_to', returnTo)

  // 4. Redirect
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: ssoClientId,
    redirect_uri: redirectUri,
    scope: 'openid profile email',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: randomString(16),
  })

  window.location.href = `${discovery.authorization_endpoint}?${params}`
}

async function logout() {
  sessionStorage.removeItem(SESSION_KEY)
  granted.value = false
  await $fetch('/api/sso/logout', { method: 'POST' }).catch(() => {})
}

function revokeAccess() {
  sessionStorage.removeItem(SESSION_KEY)
  granted.value = false
}

function isProtected() { return accessConfig.value.mode !== 'none' }
function hasAccess()   { return !isProtected() || granted.value }

// ── SSO config test ──────────────────────────────────────────

const ssoTestResult = ref<{
  ok: boolean
  authorizationEndpoint?: string
  tokenEndpoint?: string
  error?: string
} | null>(null)

const ssoTesting = ref(false)

async function testSSOConfig() {
  const url = accessConfig.value.ssoDiscoveryUrl
  if (!url) return
  ssoTesting.value = true
  ssoTestResult.value = null
  try {
    const doc = await $fetch<{ authorization_endpoint: string; token_endpoint: string }>(
      `/api/sso/discover?url=${encodeURIComponent(url)}`
    )
    ssoTestResult.value = {
      ok: true,
      authorizationEndpoint: doc.authorization_endpoint,
      tokenEndpoint: doc.token_endpoint,
    }
  }
  catch (e: unknown) {
    ssoTestResult.value = { ok: false, error: (e as { message?: string })?.message }
  }
  finally { ssoTesting.value = false }
}

export function useAccessControl() {
  if (import.meta.client) loadSession()
  return {
    accessConfig,
    granted,
    isProtected,
    hasAccess,
    checkPassword,
    hashPassword,
    revokeAccess,
    saveConfig,
    initiateSSO,
    logout,
    testSSOConfig,
    ssoTestResult,
    ssoTesting,
  }
}
