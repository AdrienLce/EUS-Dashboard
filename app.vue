<script setup lang="ts">
import { useTheme } from '~/composables/useTheme'

const { theme } = useTheme()

// Applique le thème localStorage immédiatement (avant que le serveur réponde)
// Sans sauvegarder — évite la boucle HMR en dev
onMounted(() => {
  const saved = localStorage.getItem('status-theme') ?? 'light'
  document.documentElement.setAttribute('data-theme', saved)
})
</script>

<template>
  <div class="min-h-screen bg-gray-50" style="background-color: var(--t-bg, #f3f4f6);">
    <NuxtPage />
  </div>
</template>
