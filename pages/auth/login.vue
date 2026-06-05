<script setup lang="ts">
import { useAccessControl } from '~/composables/useAccessControl'

const route = useRoute()
const router = useRouter()
const returnTo = (route.query.returnTo as string) || '/services'

const { accessConfig, checkPassword, initiateSSO, hasAccess } = useAccessControl()

// Rediriger si déjà authentifié
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
  else passwordError.value = 'Mot de passe incorrect'
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
    ssoError.value = (e as { message?: string })?.message ?? 'Erreur SSO'
    ssoLoading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex items-center justify-center p-4">
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 w-full max-w-sm space-y-6">

      <!-- Logo -->
      <div class="text-center">
        <div class="w-12 h-12 rounded-xl bg-gray-900 flex items-center justify-center mx-auto mb-3">
          <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
          </svg>
        </div>
        <h1 class="text-lg font-semibold text-gray-900">Accès restreint</h1>
        <p class="text-sm text-gray-500 mt-1">La gestion des services est protégée.</p>
      </div>

      <!-- Password -->
      <form v-if="accessConfig.mode === 'password'" class="space-y-3" @submit.prevent="submitPassword">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
          <input
            v-model="passwordInput"
            type="password"
            autofocus
            class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="••••••••"
          />
          <p v-if="passwordError" class="text-xs text-red-500 mt-1">{{ passwordError }}</p>
        </div>
        <button
          type="submit"
          class="w-full px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
          :disabled="checking"
        >
          {{ checking ? 'Vérification…' : 'Accéder' }}
        </button>
      </form>

      <!-- SSO -->
      <div v-else-if="accessConfig.mode === 'sso'" class="space-y-3">
        <button
          class="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
          :disabled="ssoLoading"
          @click="loginSSO"
        >
          <svg v-if="ssoLoading" class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
          <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
          {{ ssoLoading ? 'Redirection…' : 'Se connecter via SSO' }}
        </button>
        <p v-if="ssoError" class="text-xs text-red-500 text-center">{{ ssoError }}</p>
      </div>

      <NuxtLink to="/" class="block text-center text-xs text-gray-400 hover:text-gray-600">← Retour au dashboard</NuxtLink>
    </div>
  </div>
</template>
