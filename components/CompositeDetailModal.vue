<script setup lang="ts">
import type {
  CompositeServiceConfig,
  SubServiceConfig,
  Incident,
  MessageEntry,
} from "~/types";
import { LEVEL_COLORS, LEVEL_LABELS, worstLevel } from "~/types";
import { useStatusStore } from "~/composables/useStatusStore";
import { useRealtimeStatus } from "~/composables/useRealtimeStatus";
import { buildSummary } from "~/utils/summarize";

const props = defineProps<{
  open: boolean;
  composite: CompositeServiceConfig;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const { currentStatus, getHistory } = useStatusStore();
const { loading, refreshChild } = useRealtimeStatus();

const LEVEL_ORDER = [
  "majeur",
  "mineur",
  "leger",
  "maintenance",
  "inconnu",
  "operational",
];

const sortedChildren = computed(() =>
  [...props.composite.children].sort((a, b) => {
    const la = currentStatus.value[a.id]?.level ?? "operational";
    const lb = currentStatus.value[b.id]?.level ?? "operational";
    return LEVEL_ORDER.indexOf(la) - LEVEL_ORDER.indexOf(lb);
  }),
);

const selectedId = ref<string | null>(null);

const summary = computed(() => {
  if (!selectedSnapshot.value) return null;
  const items: (Incident | MessageEntry)[] = [
    ...(selectedSnapshot.value.incidents ?? []),
    ...(selectedSnapshot.value.entries ?? []),
  ];
  if (!items.length && selectedSnapshot.value.message) {
    // Fallback: treat the message lines as items
    const lines = selectedSnapshot.value.message
      .split("\n")
      .filter((l) => l.trim());
    return buildSummary(
      lines.map((title, i) => ({
        id: String(i),
        title,
        level: "operational" as const,
        startedAt: "",
        updatedAt: "",
      })),
    );
  }
  return buildSummary(items);
});

const DETAIL_LIMIT = 5;
const detailExpanded = ref(false);
const expandedBlocks = ref(new Set<string>());

watch(
  () => selectedId.value,
  () => {
    detailExpanded.value = false;
    expandedBlocks.value = new Set();
  },
);

function toggleBlock(key: string) {
  if (expandedBlocks.value.has(key)) expandedBlocks.value.delete(key);
  else expandedBlocks.value.add(key);
}

function isBlockExpanded(key: string) {
  return expandedBlocks.value.has(key);
}

const selectedChild = computed<SubServiceConfig | null>(() =>
  selectedId.value
    ? (props.composite.children.find((c) => c.id === selectedId.value) ?? null)
    : null,
);

const GLOBAL_ID = '__global__'

// Global by default on open, reset on close
watch(
  () => props.open,
  (open) => {
    selectedId.value = open ? GLOBAL_ID : null
  },
  { immediate: true },
)

const isGlobal = computed(() => selectedId.value === GLOBAL_ID)

// Global summary — all incidents/entries from all children
const globalLevel = computed(() => {
  const levels = sortedChildren.value
    .map(ch => currentStatus.value[ch.id]?.level)
    .filter(Boolean) as import('~/types').StatusLevel[]
  return levels.length ? worstLevel(levels) : 'operational' as const
})

const globalSummary = computed(() => {
  const items = sortedChildren.value.flatMap(ch => {
    const snap = currentStatus.value[ch.id]
    return [...(snap?.incidents ?? []), ...(snap?.entries ?? [])]
  })
  return buildSummary(items)
})

const selectedSnapshot = computed(() =>
  selectedChild.value ? currentStatus.value[selectedChild.value.id] : null,
);

const selectedHistory = computed(() =>
  selectedChild.value ? getHistory(selectedChild.value.id) : [],
);

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") emit("close");
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    const idx = sortedChildren.value.findIndex(
      (c) => c.id === selectedId.value,
    );
    if (e.key === "ArrowDown" && idx < sortedChildren.value.length - 1) {
      selectedId.value = sortedChildren.value[idx + 1].id;
    }
    if (e.key === "ArrowUp" && idx > 0) {
      selectedId.value = sortedChildren.value[idx - 1].id;
    }
    e.preventDefault();
  }
}
onMounted(() => document.addEventListener("keydown", onKeydown));
onUnmounted(() => document.removeEventListener("keydown", onKeydown));
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
        <div
          class="absolute inset-0 bg-black/40 backdrop-blur-sm"
          @click="emit('close')"
        />

        <Transition
          enter-active-class="transition duration-200"
          enter-from-class="opacity-0 translate-y-4 sm:scale-95"
          enter-to-class="opacity-100 translate-y-0 sm:scale-100"
        >
          <div
            v-if="open"
            class="relative w-full max-w-4xl h-[80vh] bg-white rounded-2xl shadow-xl flex flex-col"
          >
            <!-- Header -->
            <div
              class="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0"
            >
              <div class="flex items-center gap-2">
                <svg
                  class="w-4 h-4 text-gray-400"
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
                <h2 class="font-semibold text-gray-900 text-lg">
                  {{ composite.name }}
                </h2>
                <span class="text-sm text-gray-400"
                  >·
                  {{ composite.children.filter((c) => c.enabled).length }}
                  services</span
                >
              </div>
              <button
                class="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                @click="emit('close')"
              >
                <svg
                  class="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <!-- Body: 2 columns -->
            <div class="flex flex-1 min-h-0">
              <!-- ── Left column: navigation ─────────────── -->
              <div class="w-56 shrink-0 border-r border-gray-100 overflow-y-auto py-2">
                <!-- Global tab -->
                <button
                  class="w-full text-left flex items-center gap-2.5 px-4 py-2.5 transition-colors"
                  :class="isGlobal ? 'bg-gray-50 font-medium text-gray-900' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'"
                  @click="selectedId = GLOBAL_ID"
                >
                  <span class="w-2 h-2 rounded-full shrink-0" :class="LEVEL_COLORS[globalLevel].dot" />
                  <span class="text-sm">Global</span>
                </button>
                <div class="mx-4 my-1 border-t border-gray-100" />
                <button
                  v-for="child in sortedChildren"
                  :key="child.id"
                  class="w-full text-left flex items-center gap-2.5 px-4 py-2.5 transition-colors"
                  :class="[
                    selectedId === child.id ? 'bg-gray-50 font-medium text-gray-900' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                    !child.enabled && 'opacity-40',
                  ]"
                  @click="selectedId = child.id"
                >
                  <span class="w-2 h-2 rounded-full shrink-0" :class="LEVEL_COLORS[currentStatus[child.id]?.level ?? 'operational'].dot" />
                  <span class="text-sm truncate">{{ child.name }}</span>
                  <span v-if="loading[child.id]" class="ml-auto w-3 h-3 rounded-full border-2 border-gray-300 border-t-gray-500 animate-spin shrink-0" />
                </button>
              </div>

              <!-- ── Right column: detail ─────────────────── -->
              <div class="flex-1 overflow-y-auto">

                <!-- Global view -->
                <template v-if="isGlobal">
                  <div class="px-6 py-4 border-b border-gray-50 flex items-center gap-3">
                    <StatusBadge :level="globalLevel" />
                    <span class="text-sm text-gray-500">{{ composite.children.filter(c => c.enabled).length }} services monitored</span>
                  </div>

                  <!-- Summary rule-based -->
                  <div v-if="globalSummary" class="mx-6 mt-4 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 flex items-start gap-3">
                    <svg class="w-4 h-4 text-gray-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                    </svg>
                    <div>
                      <p class="text-xs font-medium text-gray-500 uppercase tracking-wider mb-0.5">Summary · {{ globalSummary.total }} {{ globalSummary.total > 1 ? 'entries' : 'entry' }}</p>
                      <p class="text-sm text-gray-700">{{ globalSummary.text }}</p>
                      <p v-if="globalSummary.dateRange" class="text-xs text-gray-400 mt-0.5">{{ globalSummary.dateRange }}</p>
                    </div>
                  </div>

                  <!-- Sub-service mini-cards -->
                  <div class="px-6 py-4 grid grid-cols-1 gap-2">
                    <button
                      v-for="child in sortedChildren"
                      :key="child.id"
                      class="flex items-center gap-3 p-3 rounded-xl border transition-colors text-left hover:bg-gray-50"
                      :class="LEVEL_COLORS[currentStatus[child.id]?.level ?? 'operational'].border"
                      :style="!child.enabled ? 'opacity:0.45' : ''"
                      @click="selectedId = child.id"
                    >
                      <StatusBadge :level="currentStatus[child.id]?.level ?? 'operational'" size="sm" class="shrink-0" />
                      <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium text-gray-900 truncate">{{ child.name }}</p>
                        <p class="text-xs text-gray-400 truncate mt-0.5">{{ currentStatus[child.id]?.message ?? '—' }}</p>
                      </div>
                      <svg class="w-3.5 h-3.5 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                    </button>
                  </div>
                </template>

                <template v-else-if="selectedChild">
                  <!-- Selected service header -->
                  <div
                    class="px-6 py-4 border-b border-gray-50 flex items-center justify-between gap-3"
                  >
                    <div class="flex items-center gap-3 min-w-0">
                      <StatusBadge
                        :level="selectedSnapshot?.level ?? 'operational'"
                      />
                      <h3 class="font-semibold text-gray-900 truncate">
                        {{ selectedChild.name }}
                      </h3>
                    </div>
                    <button
                      class="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
                      title="Refresh"
                      @click="refreshChild(selectedChild)"
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

                  <!-- Summary rule-based -->
                  <div
                    v-if="summary && summary.total > 1"
                    class="mx-6 mt-4 rounded-xl border border-mauve-300 bg-mauve-100 px-4 py-3 flex items-start gap-3"
                  >
                    <svg
                      class="w-4 h-4 text-gray-400 shrink-0 mt-0.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                      />
                    </svg>
                    <div class="flex-1 min-w-0">
                      <p
                        class="text-xs font-medium text-gray-500 uppercase tracking-wider mb-0.5"
                      >
                        Summary · {{ summary.total }} {{
                          summary.total > 1 ? "entries" : "entry"
                        }}
                      </p>
                      <p class="text-sm text-gray-700">{{ summary.text }}</p>
                      <p
                        v-if="summary.dateRange"
                        class="text-xs text-gray-400 mt-0.5"
                      >
                        {{ summary.dateRange }}
                      </p>
                    </div>
                  </div>

                  <!-- Details: incidents (with pill) + entries/messages (without pill) -->
                  <div
                    v-if="
                      selectedSnapshot &&
                      (selectedSnapshot.incidents?.length ||
                        selectedSnapshot.entries?.length ||
                        selectedSnapshot.message)
                    "
                    class="px-6 py-4 border-b border-gray-50 space-y-2"
                  >
                    <!-- Incidents → WITH status pill -->
                    <template v-if="selectedSnapshot.incidents?.length">
                      <div
                        v-for="inc in detailExpanded
                          ? selectedSnapshot.incidents
                          : selectedSnapshot.incidents.slice(0, DETAIL_LIMIT)"
                        :key="inc.id"
                        class="rounded-lg border bg-gray-50 p-3 space-y-1"
                        :class="LEVEL_COLORS[inc.level].border"
                      >
                        <div class="flex items-start gap-2">
                          <StatusBadge
                            :level="inc.level"
                            size="sm"
                            class="shrink-0 mt-0.5"
                          />
                          <div class="flex-1 min-w-0">
                            <p class="text-sm font-medium text-gray-800">
                              {{ inc.title }}
                            </p>
                            <template v-if="inc.message">
                              <p
                                class="text-xs text-gray-500 mt-1"
                                :class="
                                  isBlockExpanded(inc.id) ? '' : 'line-clamp-3'
                                "
                              >
                                {{ inc.message }}
                              </p>
                              <button
                                v-if="inc.message.length > 200"
                                class="text-xs text-blue-500 hover:text-blue-600 mt-0.5"
                                @click.stop="toggleBlock(inc.id)"
                              >
                                {{
                                  isBlockExpanded(inc.id)
                                    ? "Show less"
                                    : "Show more"
                                }}
                              </button>
                            </template>
                            <div
                              class="flex items-center gap-3 mt-1 text-xs text-gray-400"
                            >
                              <span>{{ formatDate(inc.updatedAt) }}</span>
                              <a
                                v-if="inc.url"
                                :href="inc.url"
                                target="_blank"
                                rel="noopener noreferrer"
                                class="text-blue-500 hover:underline"
                                @click.stop
                                >View →</a
                              >
                            </div>
                          </div>
                        </div>
                      </div>
                      <button
                        v-if="selectedSnapshot.incidents.length > DETAIL_LIMIT"
                        class="text-xs text-blue-500 hover:text-blue-600 w-full text-center py-1"
                        @click="detailExpanded = !detailExpanded"
                      >
                        {{
                          detailExpanded
                            ? "Show less"
                            : `Show ${selectedSnapshot.incidents.length - DETAIL_LIMIT} more`
                        }}
                      </button>
                    </template>

                    <!-- Structured entries → WITHOUT pill -->
                    <template v-else-if="selectedSnapshot.entries?.length">
                      <div
                        v-for="(entry, i) in detailExpanded
                          ? selectedSnapshot.entries
                          : selectedSnapshot.entries.slice(0, DETAIL_LIMIT)"
                        :key="i"
                        class="rounded-lg border border-gray-100 bg-gray-50 p-3 space-y-1"
                      >
                        <p class="text-sm font-medium text-gray-800">
                          {{ entry.title }}
                        </p>
                        <template v-if="entry.summary">
                          <p
                            class="text-xs text-gray-500"
                            :class="
                              isBlockExpanded(`e${i}`) ? '' : 'line-clamp-3'
                            "
                          >
                            {{ entry.summary }}
                          </p>
                          <button
                            v-if="entry.summary.length > 200"
                            class="text-xs text-blue-500 hover:text-blue-600"
                            @click="toggleBlock(`e${i}`)"
                          >
                            {{
                              isBlockExpanded(`e${i}`)
                                ? "Show less"
                                : "Show more"
                            }}
                          </button>
                        </template>
                        <div
                          class="flex items-center gap-3 text-xs text-gray-400"
                        >
                          <span v-if="entry.date">{{
                            formatDate(entry.date)
                          }}</span>
                          <a
                            v-if="entry.url"
                            :href="entry.url"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="text-blue-500 hover:underline"
                            @click.stop
                            >View →</a
                          >
                        </div>
                      </div>
                      <button
                        v-if="selectedSnapshot.entries.length > DETAIL_LIMIT"
                        class="text-xs text-blue-500 hover:text-blue-600 w-full text-center py-1"
                        @click="detailExpanded = !detailExpanded"
                      >
                        {{
                          detailExpanded
                            ? "Show less"
                            : `Show ${selectedSnapshot.entries.length - DETAIL_LIMIT} more`
                        }}
                      </button>
                    </template>

                    <!-- Multiline message fallback → WITHOUT pill -->
                    <template v-else-if="selectedSnapshot.message">
                      <div
                        v-for="(line, i) in detailExpanded
                          ? selectedSnapshot.message
                              .split('\n')
                              .filter((l) => l.trim())
                          : selectedSnapshot.message
                              .split('\n')
                              .filter((l) => l.trim())
                              .slice(0, DETAIL_LIMIT)"
                        :key="i"
                        class="rounded-lg border border-gray-100 bg-gray-50 p-3"
                      >
                        <p class="text-sm text-gray-700">{{ line }}</p>
                      </div>
                      <button
                        v-if="
                          selectedSnapshot.message
                            .split('\n')
                            .filter((l) => l.trim()).length > DETAIL_LIMIT
                        "
                        class="text-xs text-blue-500 hover:text-blue-600 w-full text-center py-1"
                        @click="detailExpanded = !detailExpanded"
                      >
                        {{
                          detailExpanded
                            ? "Show less"
                            : `Show ${selectedSnapshot.message.split("\n").filter((l) => l.trim()).length - DETAIL_LIMIT} more`
                        }}
                      </button>
                    </template>
                  </div>

                  <!-- History -->
                  <div class="px-6 py-4 space-y-4">
                    <p
                      class="text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      History
                    </p>

                    <div
                      v-if="selectedHistory.length === 0"
                      class="text-center py-8 text-gray-400 text-sm"
                    >
                      No history available
                    </div>

                    <div v-else class="space-y-4">
                      <div
                        v-for="snap in selectedHistory"
                        :key="snap.timestamp"
                        class="space-y-2"
                      >
                        <div class="flex items-center gap-3">
                          <StatusBadge :level="snap.level" size="sm" />
                          <span class="text-xs text-gray-400 ml-auto">{{
                            formatDate(snap.timestamp)
                          }}</span>
                        </div>
                        <p
                          v-if="snap.message"
                          class="text-xs text-gray-500 pl-1"
                        >
                          {{ snap.message }}
                        </p>
                        <hr class="border-gray-100 last:hidden" />
                      </div>
                    </div>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
