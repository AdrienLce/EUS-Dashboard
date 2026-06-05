<script setup lang="ts">
import type { StatusSnapshot } from "~/types";
import { LEVEL_COLORS, LEVEL_LABELS } from "~/types";
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

const isComposite = computed(() => !!props.subServices);

const level = computed(() => (props.snapshot?.level ?? 'operational') as import('~/types').StatusLevel)
const colors = computed(() => LEVEL_COLORS[level.value]);
const statusLabel = computed(() => LEVEL_LABELS[level.value]);

const lastUpdated = computed(() => {
  // Composite : prendre le timestamp le plus récent parmi les enfants
  let ts = props.snapshot?.timestamp;
  if (!ts && props.subServices) {
    const times = props.subServices
      .map((s) => s.timestamp)
      .filter(Boolean) as string[];
    ts = times.sort().at(-1);
  }
  if (!ts) return null;
  return new Date(ts).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
});

const incidentCount = computed(() => props.snapshot?.incidents?.length ?? 0);

const { getConfig } = useLevelConfig();
const compactRingStyle = computed(() => {
  if (level.value === 'operational' || level.value === 'inconnu') return {}
  const hex = getConfig(level.value).color
  return { boxShadow: `0 0 0 2px ${hex}` }
});

const displayMessage = computed(() => {
  if (!isComposite.value && incidentCount.value === 1) {
    const inc = props.snapshot!.incidents[0]
    return inc.message ? `${inc.title} — ${inc.message}` : inc.title
  }
  return props.snapshot?.message
});

const degradedCount = computed(
  () =>
    (props.subServices ?? []).filter(
      (s) => s.level && s.level !== "operational" && s.level !== "inconnu",
    ).length,
);
</script>

<template>
  <!-- Mode compact : ligne horizontale dense -->
  <button
    v-if="compact"
    class="group w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg border border-gray-100 bg-white hover:bg-gray-50 transition-colors"
    :style="compactRingStyle"
    @click="emit('click')"
  >
    <span class="w-2 h-2 rounded-full shrink-0" :class="colors.dot" />
    <svg v-if="isComposite" class="w-3 h-3 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
    <span class="text-sm font-medium text-gray-800 truncate flex-1">{{ name }}</span>
    <span class="text-xs text-gray-400 shrink-0">{{ lastUpdated }}</span>
    <span v-if="loading" class="w-3 h-3 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin shrink-0" />
  </button>

  <!-- Mode normal -->
  <div v-else :class="level !== 'operational' && colors.banner" class="rounded-xl">
    <button
      class="group w-full text-left rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-gray-400"
      @click="emit('click')"
    >
      <!-- Header -->
      <div class="flex items-start justify-between gap-3">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <!-- Composite icon -->
            <svg
              v-if="isComposite"
              class="w-3.5 h-3.5 text-gray-400 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
            <h3 class="font-semibold text-gray-900 truncate">{{ name }}</h3>
            <span
              v-if="loading"
              class="inline-block w-3 h-3 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin shrink-0"
            />
          </div>
          <StatusBadge :level="level" size="sm" />
        </div>

        <button
          class="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
          title="Rafraîchir"
          @click.stop="emit('refresh')"
        >
          <svg
            class="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      </div>

      <!-- Message (simple et composite) -->
      <p class="mt-3 text-sm text-gray-600 line-clamp-2 min-h-[2.5rem]">
        <span v-if="error" class="text-red-600">{{ error }}</span>
        <span v-else-if="displayMessage">{{ displayMessage }}</span>
        <span v-else class="text-gray-400 italic">En attente de données…</span>
      </p>

      <!-- Footer -->
      <div class="mt-3 flex items-center justify-between text-xs text-gray-400">
        <span class="flex items-center gap-1">
          <!-- Composite: compte de services -->
          <template v-if="isComposite">
            <svg
              class="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
            {{ subServices!.length }} service{{
              subServices!.length > 1 ? "s" : ""
            }}
            <span
              v-if="degradedCount > 0"
              class="text-orange-500 font-medium ml-1"
              >{{ degradedCount }} dégradé{{
                degradedCount > 1 ? "s" : ""
              }}</span
            >
          </template>
          <!-- Simple: incidents -->
          <template v-else-if="incidentCount > 0">
            <svg
              class="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            {{ incidentCount }} incident{{ incidentCount > 1 ? "s" : "" }}
          </template>
        </span>

        <span v-if="lastUpdated">{{ lastUpdated }}</span>
      </div>
    </button>
    <div
      v-if="level !== 'operational'"
      :class="colors.banner"
      class="p-2 rounded-b-lg text-xs text-center"
    >
      {{ statusLabel }}
    </div>
  </div>
</template>

