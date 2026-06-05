<!-- Panneau Authentification — sous-composant de ServiceForm -->
<script setup lang="ts">
const AUTH_TYPES = [
  { value: 'none', label: 'Aucune' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'basic', label: 'Basic Auth' },
  { value: 'apikey', label: 'API Key (header)' },
]

const auth = defineModel<{
  type: 'none' | 'bearer' | 'basic' | 'apikey'
  token: string
  username: string
  password: string
  headerName: string
  headerValue: string
  showSecret: boolean
}>('auth', { required: true })
</script>

<template>
  <div class="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-3">
    <div class="flex items-center gap-2">
      <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
      <label class="text-sm font-medium text-gray-700">Authentification</label>
    </div>

    <select v-model="auth.type" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
      <option v-for="t in AUTH_TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
    </select>

    <!-- Bearer -->
    <div v-if="auth.type === 'bearer'">
      <label class="block text-xs text-gray-500 mb-1">Token</label>
      <div class="flex gap-2">
        <input v-model="auth.token" :type="auth.showSecret ? 'text' : 'password'" placeholder="eyJhbGci..." autocomplete="new-password" class="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
        <button type="button" class="px-3 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-white text-xs" @click="auth.showSecret = !auth.showSecret">{{ auth.showSecret ? 'Cacher' : 'Voir' }}</button>
      </div>
    </div>

    <!-- Basic -->
    <div v-if="auth.type === 'basic'" class="space-y-2">
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="block text-xs text-gray-500 mb-1">Utilisateur</label>
          <input v-model="auth.username" type="text" autocomplete="username" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
        </div>
        <div>
          <label class="block text-xs text-gray-500 mb-1">Mot de passe</label>
          <div class="flex gap-1">
            <input v-model="auth.password" :type="auth.showSecret ? 'text' : 'password'" autocomplete="new-password" class="flex-1 min-w-0 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
            <button type="button" class="px-2 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-white text-xs shrink-0" @click="auth.showSecret = !auth.showSecret">{{ auth.showSecret ? 'Cacher' : 'Voir' }}</button>
          </div>
        </div>
      </div>
    </div>

    <!-- API Key -->
    <div v-if="auth.type === 'apikey'" class="space-y-2">
      <div>
        <label class="block text-xs text-gray-500 mb-1">Nom du header</label>
        <input v-model="auth.headerName" type="text" placeholder="X-API-Key" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
      </div>
      <div>
        <label class="block text-xs text-gray-500 mb-1">Valeur</label>
        <div class="flex gap-2">
          <input v-model="auth.headerValue" :type="auth.showSecret ? 'text' : 'password'" autocomplete="new-password" class="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
          <button type="button" class="px-3 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-white text-xs" @click="auth.showSecret = !auth.showSecret">{{ auth.showSecret ? 'Cacher' : 'Voir' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
