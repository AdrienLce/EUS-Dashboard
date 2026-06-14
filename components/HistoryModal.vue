<script setup lang="ts">
import type { ServiceConfig, StatusSnapshot } from '~/types'
import { LEVEL_LABELS, LEVEL_COLORS } from '~/types'

const props = defineProps<{
  service: ServiceConfig
  /** Snapshot courant (temps réel) — affiché en « État actuel » au-dessus de l'historique */
  current?: StatusSnapshot | null
  snapshots: StatusSnapshot[]
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

/** Incidents en cours sur le snapshot courant */
const currentIncidents = computed(() => props.current?.incidents ?? [])
/** Entrées structurées (RSS/custom) sur le snapshot courant */
const currentEntries = computed(() => props.current?.entries ?? [])
/** Vrai si l'état courant comporte des incidents ou des entrées à mettre en avant */
const hasCurrentDetail = computed(
  () => currentIncidents.value.length > 0 || currentEntries.value.length > 0,
)
/**
 * Historique à afficher dans la timeline.
 * Quand l'état courant est mis en avant, on évite de ré-afficher le snapshot courant
 * (même timestamp) une seconde fois juste en dessous.
 */
const historySnaps = computed(() => {
  if (!props.current || !hasCurrentDetail.value) return props.snapshots
  return props.snapshots.filter((s) => s.timestamp !== props.current!.timestamp)
})

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const expandedSnaps = ref(new Set<string>())
function toggleSnap(ts: string) {
  if (expandedSnaps.value.has(ts)) expandedSnaps.value.delete(ts)
  else expandedSnaps.value.add(ts)
  // Force reactivity
  expandedSnaps.value = new Set(expandedSnaps.value)
}
function snapLimit(ts: string) {
  return expandedSnaps.value.has(ts) ? Infinity : 3
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      >
        <!-- Backdrop -->
        <div
          class="absolute inset-0 bg-black/40 backdrop-blur-sm"
          @click="emit('close')"
        />

        <!-- Panel -->
        <Transition
          enter-active-class="transition duration-200"
          enter-from-class="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
          enter-to-class="opacity-100 translate-y-0 sm:scale-100"
          leave-active-class="transition duration-150"
          leave-from-class="opacity-100"
          leave-to-class="opacity-0 scale-95"
        >
          <div
            v-if="open"
            class="relative w-full max-w-2xl max-h-[85vh] bg-white rounded-2xl shadow-xl flex flex-col"
          >
            <!-- Header -->
            <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 class="font-semibold text-gray-900 text-lg">{{ service.name }}</h2>
                <p class="text-sm text-gray-500">Status history</p>
              </div>
              <button
                class="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                @click="emit('close')"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <!-- Content -->
            <div class="flex-1 overflow-y-auto px-6 py-4 space-y-6">
              <!-- ── État actuel : incidents / entrées en cours ───────────── -->
              <section v-if="hasCurrentDetail" class="space-y-3">
                <div class="flex items-center gap-3">
                  <StatusBadge :level="current!.level" />
                  <span class="text-xs font-medium text-gray-500 uppercase tracking-wider">Current state</span>
                  <span class="text-sm text-gray-400 ml-auto">{{ formatDate(current!.timestamp) }}</span>
                </div>

                <!-- Incidents → AVEC pill -->
                <div v-if="currentIncidents.length" class="space-y-2">
                  <div
                    v-for="incident in currentIncidents"
                    :key="incident.id"
                    class="rounded-lg border bg-gray-50 p-2.5"
                    :class="LEVEL_COLORS[incident.level].border"
                  >
                    <div class="flex items-start gap-2">
                      <StatusBadge :level="incident.level" size="sm" class="mt-0.5 shrink-0" />
                      <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium text-gray-800">{{ incident.title }}</p>
                        <p v-if="incident.message" class="text-xs text-gray-500 mt-1">{{ incident.message }}</p>
                        <div class="flex items-center gap-3 mt-1 text-xs text-gray-400">
                          <span>{{ formatDate(incident.updatedAt) }}</span>
                          <a v-if="incident.url" :href="incident.url" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:underline" @click.stop>View →</a>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Entries → SANS pill -->
                <div v-else-if="currentEntries.length" class="space-y-1.5">
                  <div v-for="(entry, i) in currentEntries" :key="i" class="rounded-lg border border-gray-100 bg-gray-50 p-2.5 space-y-1">
                    <p class="text-sm font-medium text-gray-800">{{ entry.title }}</p>
                    <p v-if="entry.summary" class="text-xs text-gray-500 line-clamp-2">{{ entry.summary }}</p>
                    <div class="flex gap-3 text-xs text-gray-400">
                      <span v-if="entry.date">{{ formatDate(entry.date) }}</span>
                      <a v-if="entry.url" :href="entry.url" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:underline">View →</a>
                    </div>
                  </div>
                </div>
              </section>

              <!-- ── Historique ───────────────────────────────────────────── -->
              <div v-if="historySnaps.length === 0 && !hasCurrentDetail" class="text-center py-12 text-gray-400">
                <svg class="w-10 h-10 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p>No history available</p>
              </div>

              <template v-else-if="historySnaps.length">
                <p class="text-xs font-medium text-gray-500 uppercase tracking-wider">History</p>
                <div v-for="snap in historySnaps" :key="snap.timestamp" class="space-y-3">
                  <!-- Snapshot header -->
                  <div class="flex items-center gap-3">
                    <StatusBadge :level="snap.level" />
                    <span class="text-sm text-gray-400 ml-auto">{{ formatDate(snap.timestamp) }}</span>
                  </div>

                  <!-- Incidents → AVEC pill -->
                  <div v-if="snap.incidents?.length" class="space-y-2">
                    <div
                      v-for="incident in snap.incidents.slice(0, snapLimit(snap.timestamp))"
                      :key="incident.id"
                      class="rounded-lg border bg-gray-50 p-2.5"
                      :class="LEVEL_COLORS[incident.level].border"
                    >
                      <div class="flex items-start gap-2">
                        <StatusBadge :level="incident.level" size="sm" class="mt-0.5 shrink-0" />
                        <div class="flex-1 min-w-0">
                          <p class="text-sm font-medium text-gray-800">{{ incident.title }}</p>
                          <p v-if="incident.message" class="text-xs text-gray-500 mt-1 line-clamp-3">{{ incident.message }}</p>
                          <div class="flex items-center gap-3 mt-1 text-xs text-gray-400">
                            <span>{{ formatDate(incident.updatedAt) }}</span>
                            <a v-if="incident.url" :href="incident.url" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:underline" @click.stop>View →</a>
                          </div>
                        </div>
                      </div>
                    </div>
                    <button v-if="snap.incidents.length > 3" class="text-xs text-blue-500 hover:text-blue-600 w-full text-center py-1" @click="toggleSnap(snap.timestamp)">
                      {{ expandedSnaps.has(snap.timestamp) ? 'Show less' : `+${snap.incidents.length - 3} more` }}
                    </button>
                  </div>

                  <!-- Entries/messages → SANS pill -->
                  <div v-else-if="snap.entries?.length || snap.message" class="space-y-1.5">
                    <template v-if="snap.entries?.length">
                      <div v-for="(entry, i) in snap.entries.slice(0, snapLimit(snap.timestamp))" :key="i" class="rounded-lg border border-gray-100 bg-gray-50 p-2.5 space-y-1">
                        <p class="text-sm font-medium text-gray-800">{{ entry.title }}</p>
                        <p v-if="entry.summary" class="text-xs text-gray-500 line-clamp-2">{{ entry.summary }}</p>
                        <div class="flex gap-3 text-xs text-gray-400">
                          <span v-if="entry.date">{{ formatDate(entry.date) }}</span>
                          <a v-if="entry.url" :href="entry.url" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:underline">View →</a>
                        </div>
                      </div>
                      <button v-if="snap.entries.length > 3" class="text-xs text-blue-500 hover:text-blue-600 w-full text-center py-1" @click="toggleSnap(snap.timestamp)">
                        {{ expandedSnaps.has(snap.timestamp) ? 'Show less' : `+${snap.entries.length - 3} more` }}
                      </button>
                    </template>
                    <template v-else>
                      <div v-for="(line, i) in snap.message.split('\n').filter(l => l.trim()).slice(0, snapLimit(snap.timestamp))" :key="i" class="rounded-lg border border-gray-100 bg-gray-50 p-2.5">
                        <p class="text-xs text-gray-700 line-clamp-2">{{ line }}</p>
                      </div>
                      <button v-if="snap.message.split('\n').filter(l => l.trim()).length > 3" class="text-xs text-blue-500 hover:text-blue-600 w-full text-center py-1" @click="toggleSnap(snap.timestamp)">
                        {{ expandedSnaps.has(snap.timestamp) ? 'Show less' : `+${snap.message.split('\n').filter(l => l.trim()).length - 3} more` }}
                      </button>
                    </template>
                  </div>

                  <hr class="border-gray-100 last:hidden" />
                </div>
              </template>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
