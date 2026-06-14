<script setup lang="ts">
/**
 * OIDC callback page.
 * The IdP redirects here after authentication with ?code=...&state=...
 * This page exchanges the code for tokens via the Nitro server.
 */

const route = useRoute()
const router = useRouter()
const error = ref<string | null>(null)
const loading = ref(true)

onMounted(async () => {
  const code = route.query.code as string | undefined
  const returnTo = sessionStorage.getItem('sso_return_to') ?? '/services'

  if (!code) {
    error.value = 'Authorization code missing in the return URL.'
    loading.value = false
    return
  }

  // Retrieve the parameters stored before the redirect
  const codeVerifier  = sessionStorage.getItem('pkce_verifier')
  const tokenEndpoint = sessionStorage.getItem('sso_token_endpoint')
  const clientId      = sessionStorage.getItem('sso_client_id')
  const redirectUri   = `${window.location.origin}/auth/callback`

  if (!codeVerifier || !tokenEndpoint || !clientId) {
    error.value = 'PKCE session expired or corrupted. Please start the login again.'
    loading.value = false
    return
  }

  try {
    await $fetch('/api/sso/callback', {
      method: 'POST',
      body: { code, codeVerifier, tokenEndpoint, clientId, redirectUri },
    })

    // Clean up session storage
    sessionStorage.removeItem('pkce_verifier')
    sessionStorage.removeItem('sso_token_endpoint')
    sessionStorage.removeItem('sso_client_id')
    sessionStorage.removeItem('sso_return_to')
    sessionStorage.setItem('status-access-granted', '1')

    router.replace(returnTo)
  }
  catch (e: unknown) {
    error.value = (e as { message?: string })?.message ?? 'Error while exchanging the code.'
    loading.value = false
  }
})
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex items-center justify-center p-4">
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-sm w-full text-center space-y-4">
      <template v-if="loading && !error">
        <div class="w-10 h-10 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin mx-auto" />
        <p class="text-sm text-gray-500">Signing in…</p>
      </template>
      <template v-else-if="error">
        <svg class="w-10 h-10 text-red-400 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
        </svg>
        <p class="text-sm font-medium text-gray-900">Authentication error</p>
        <p class="text-xs text-gray-500">{{ error }}</p>
        <NuxtLink to="/services" class="text-sm text-indigo-600 hover:underline">Back</NuxtLink>
      </template>
    </div>
  </div>
</template>
