<script setup lang="ts">
import { useAccessControl } from '~/composables/useAccessControl'

const route = useRoute()
const router = useRouter()
const returnTo = (route.query.returnTo as string) || '/services'

const LOGO_URL =
  'https://uvzfnheuaduyivtddfba.supabase.co/storage/v1/object/public/app-logo/logo-sentinel.png'

const { accessConfig, checkPassword, initiateSSO, hasAccess } = useAccessControl()

// Redirect if already authenticated
onMounted(() => { if (hasAccess()) router.replace(returnTo) })

// ── Password ─────────────────────────────────────────────────
const passwordInput = ref('')
const passwordError = ref('')
const checking = ref(false)

async function submitPassword() {
  if (!passwordInput.value) return
  checking.value = true
  passwordError.value = ''
  const ok = await checkPassword(passwordInput.value)
  checking.value = false
  if (ok) router.replace(returnTo)
  else passwordError.value = 'Incorrect password'
}

// ── SSO ──────────────────────────────────────────────────────
const ssoLoading = ref(false)
const ssoError = ref('')

async function loginSSO() {
  ssoLoading.value = true
  ssoError.value = ''
  try {
    await initiateSSO(returnTo)
  }
  catch (e: unknown) {
    ssoError.value = (e as { message?: string })?.message ?? 'SSO error'
    ssoLoading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-4">
    <div class="bg-white rounded-3xl shadow-xl border border-gray-100 p-8 w-full max-w-sm space-y-6 animate-rise">

      <!-- Brand -->
      <div class="text-center">
        <img :src="LOGO_URL" alt="Sentinel" class="w-14 h-14 rounded-2xl object-contain mx-auto mb-3 shadow-sm ring-1 ring-black/5 bg-white" />
        <h1 class="text-lg font-bold text-gray-900 tracking-tight">Restricted access</h1>
        <p class="text-sm text-gray-500 mt-1">Service management is protected.</p>
      </div>

      <!-- Password -->
      <form v-if="accessConfig.mode === 'password'" class="space-y-3" @submit.prevent="submitPassword">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <input
            v-model="passwordInput"
            type="password"
            autofocus
            class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="••••••••"
          />
          <p v-if="passwordError" class="text-xs text-red-500 mt-1">{{ passwordError }}</p>
        </div>
        <button
          type="submit"
          class="w-full px-4 py-2 bg-accent text-white text-sm font-medium rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
          :disabled="checking"
        >
          {{ checking ? 'Verifying…' : 'Enter' }}
        </button>
      </form>

      <!-- SSO -->
      <div v-else-if="accessConfig.mode === 'sso'" class="space-y-3">
        <button
          class="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-accent text-white text-sm font-medium rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
          :disabled="ssoLoading"
          @click="loginSSO"
        >
          <svg v-if="ssoLoading" class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
          <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
          {{ ssoLoading ? 'Redirecting…' : 'Sign in with SSO' }}
        </button>
        <p v-if="ssoError" class="text-xs text-red-500 text-center">{{ ssoError }}</p>
      </div>

      <NuxtLink to="/" class="block text-center text-xs text-gray-400 hover:text-gray-600">← Back to dashboard</NuxtLink>
    </div>
  </div>
</template>
