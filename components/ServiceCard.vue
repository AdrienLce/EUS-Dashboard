<script setup lang="ts">
import type { StatusSnapshot, StatusLevel } from "~/types";
import { useLevelConfig } from "~/composables/useLevelConfig";

interface SubEntry {
  id: string;
  name: string;
  level?: string;
  timestamp?: string;
}

const props = defineProps<{
  name: string;
  snapshot?: StatusSnapshot;
  loading?: boolean;
  error?: string | null;
  subServices?: SubEntry[];
  compact?: boolean;
}>();

const emit = defineEmits<{
  (e: "click"): void;
  (e: "refresh"): void;
}>();

const { getConfig } = useLevelConfig();

const isComposite = computed(() => !!props.subServices);
const level = computed(() => (props.snapshot?.level ?? "operational") as StatusLevel);
const isActive = computed(() => level.value !== "operational" && level.value !== "inconnu");
const accentHex = computed(() => getConfig(level.value).color);

const lastUpdated = computed(() => {
  let ts = props.snapshot?.timestamp;
  if (!ts && props.subServices) {
    const times = props.subServices.map((s) => s.timestamp).filter(Boolean) as string[];
    ts = times.sort().at(-1);
  }
  if (!ts) return null;
  return new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
});

const incidentCount = computed(() => props.snapshot?.incidents?.length ?? 0);

const compactRingStyle = computed(() =>
  isActive.value ? { boxShadow: `inset 0 0 0 1.5px ${accentHex.value}` } : {},
);

const displayMessage = computed(() => {
  if (!isComposite.value && incidentCount.value === 1) {
    const inc = props.snapshot!.incidents[0];
    return inc.message ? `${inc.title} — ${inc.message}` : inc.title;
  }
  return props.snapshot?.message;
});

const degradedCount = computed(
  () =>
    (props.subServices ?? []).filter(
      (s) => s.level && s.level !== "operational" && s.level !== "inconnu",
    ).length,
);
</script>

<template>
  <!-- Compact : dense horizontal row -->
  <button
    v-if="compact"
    class="group w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-100 bg-white hover:bg-gray-50 transition-colors ring-accent"
    :style="compactRingStyle"
    @click="emit('click')"
  >
    <span class="w-2 h-2 rounded-full shrink-0" :class="isActive ? 'animate-pulse' : ''" :style="{ background: accentHex }" />
    <svg v-if="isComposite" class="w-3 h-3 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
    <span class="text-sm font-medium text-gray-800 truncate flex-1">{{ name }}</span>
    <span class="text-xs text-gray-400 shrink-0 tabular-nums">{{ lastUpdated }}</span>
    <span v-if="loading" class="w-3 h-3 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin shrink-0" />
  </button>

  <!-- Normal -->
  <button
    v-else
    class="card-lift group relative w-full text-left rounded-2xl border border-gray-100 bg-white p-5 shadow-sm overflow-hidden focus:outline-none ring-accent"
    @click="emit('click')"
  >
    <!-- Status accent bar -->
    <span
      v-if="isActive"
      class="absolute left-0 top-4 bottom-4 w-1 rounded-full"
      :style="{ background: accentHex }"
    />

    <!-- Header -->
    <div class="flex items-start justify-between gap-3" :class="isActive ? 'pl-2.5' : ''">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-2">
          <svg v-if="isComposite" class="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <h3 class="font-semibold text-gray-900 truncate">{{ name }}</h3>
          <span v-if="loading" class="inline-block w-3 h-3 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin shrink-0" />
        </div>
        <StatusBadge :level="level" size="sm" />
      </div>

      <span
        class="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors opacity-0 group-hover:opacity-100"
        title="Refresh"
        role="button"
        @click.stop="emit('refresh')"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </span>
    </div>

    <!-- Message -->
    <p class="mt-3 text-sm text-gray-600 line-clamp-2 min-h-[2.5rem]" :class="isActive ? 'pl-2.5' : ''">
      <span v-if="error" class="text-red-600">{{ error }}</span>
      <span v-else-if="displayMessage">{{ displayMessage }}</span>
      <span v-else class="text-gray-400 italic">Awaiting data…</span>
    </p>

    <!-- Footer -->
    <div class="mt-3 flex items-center justify-between text-xs text-gray-400" :class="isActive ? 'pl-2.5' : ''">
      <span class="flex items-center gap-1">
        <template v-if="isComposite">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          {{ subServices!.length }} service{{ subServices!.length > 1 ? "s" : "" }}
          <span v-if="degradedCount > 0" class="font-medium ml-1" :style="{ color: accentHex }">
            · {{ degradedCount }} degraded
          </span>
        </template>
        <template v-else-if="incidentCount > 0">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {{ incidentCount }} incident{{ incidentCount > 1 ? "s" : "" }}
        </template>
      </span>
      <span v-if="lastUpdated" class="tabular-nums">{{ lastUpdated }}</span>
    </div>
  </button>
</template>
