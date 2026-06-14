<script setup lang="ts">
import { useRoute } from 'vue-router'

defineProps<{
  /** Optional small count badge shown next to the title (e.g. number of services) */
  count?: number
}>()

const LOGO_URL =
  'https://uvzfnheuaduyivtddfba.supabase.co/storage/v1/object/public/app-logo/logo-sentinel.png'

const route = useRoute()

const links = [
  { to: '/', label: 'Dashboard' },
  { to: '/services', label: 'Services' },
  { to: '/settings', label: 'Settings' },
]

function isActive(to: string) {
  return to === '/' ? route.path === '/' : route.path.startsWith(to)
}
</script>

<template>
  <header class="glass sticky top-0 z-40 border-b border-gray-100">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
      <!-- Brand -->
      <NuxtLink to="/" class="flex items-center gap-3 shrink-0 group">
        <img
          :src="LOGO_URL"
          alt="Sentinel"
          class="h-9 w-9 rounded-xl object-contain shadow-sm ring-1 ring-black/5 bg-white/60 transition-transform group-hover:scale-105"
        />
        <span class="hidden sm:flex flex-col leading-none">
          <span class="font-bold text-gray-900 tracking-tight">Sentinel</span>
          <span class="text-[11px] font-medium text-gray-400 tracking-wide">Status Dashboard</span>
        </span>
        <span
          v-if="count !== undefined && count > 0"
          class="ml-1 text-xs font-semibold bg-gray-100 text-gray-500 rounded-full px-2 py-0.5"
        >{{ count }}</span>
      </NuxtLink>

      <!-- Nav -->
      <nav class="hidden md:flex items-center gap-1 p-1 rounded-xl bg-gray-100/70">
        <NuxtLink
          v-for="l in links"
          :key="l.to"
          :to="l.to"
          class="px-3.5 py-1.5 text-sm font-medium rounded-lg transition-colors"
          :class="isActive(l.to)
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-500 hover:text-gray-800'"
        >
          {{ l.label }}
        </NuxtLink>
      </nav>

      <!-- Page-specific actions -->
      <div class="flex items-center gap-2">
        <slot name="actions" />
      </div>
    </div>
  </header>
</template>
