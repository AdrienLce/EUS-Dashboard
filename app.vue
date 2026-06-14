<script setup lang="ts">
import { useTheme } from '~/composables/useTheme'
import { useRealtimeStatus } from '~/composables/useRealtimeStatus'

const { theme } = useTheme()
const { connect, disconnect } = useRealtimeStatus()

onMounted(() => {
  // Apply the saved theme
  const saved = localStorage.getItem('status-theme') ?? 'light'
  document.documentElement.setAttribute('data-theme', saved)

  // WebSocket connection — the server will push the snapshots
  connect()
})

onUnmounted(() => disconnect())
</script>

<template>
  <div class="app-shell">
    <NuxtPage />
    <ToastContainer />
  </div>
</template>
