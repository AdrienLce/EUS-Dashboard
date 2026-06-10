<script setup lang="ts">
import { useTheme } from '~/composables/useTheme'
import { useRealtimeStatus } from '~/composables/useRealtimeStatus'

const { theme } = useTheme()
const { connect, disconnect } = useRealtimeStatus()

onMounted(() => {
  // Appliquer le thème sauvegardé
  const saved = localStorage.getItem('status-theme') ?? 'light'
  document.documentElement.setAttribute('data-theme', saved)

  // Connexion WebSocket — le serveur pushera les snapshots
  connect()
})

onUnmounted(() => disconnect())
</script>

<template>
  <div class="min-h-screen bg-gray-50" style="background-color: var(--t-bg, #f3f4f6);">
    <NuxtPage />
    <ToastContainer />
  </div>
</template>
