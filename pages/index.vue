<script setup lang="ts">
import type {
  ServiceConfig,
  CompositeServiceConfig,
  StatusLevel,
} from "~/types";
import { worstLevel } from "~/types";
import { useDisplayMode } from "~/composables/useDisplayMode";
import { buildSummary } from "~/utils/summarize";
import { useServices } from "~/composables/useServices";
import { useComposites } from "~/composables/useComposites";
import { useStatusStore } from "~/composables/useStatusStore";
import { useRealtimeStatus } from "~/composables/useRealtimeStatus";

useHead({ title: "Sentinel — Status Dashboard" });

const { compact, toggle: toggleCompact, pageStyle } = useDisplayMode();
const containerClass = computed(() => pageStyle.value === 'large' ? 'w-full px-4 sm:px-6' : 'max-w-7xl mx-auto px-4 sm:px-6')

const gridClass = computed(() => {
  const isLarge = pageStyle.value === 'large'
  if (compact.value) return isLarge
    ? 'grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8'
    : 'grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
  return isLarge
    ? 'grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5'
    : 'grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
})
const { enabledServices } = useServices();
const { enabledComposites } = useComposites();
const { currentStatus, getHistory } = useStatusStore();
const { requestRefresh } = useRealtimeStatus();
const loading = ref<Record<string, boolean>>({});
const errors = ref<Record<string, string | null>>({});

function refreshService(svc: { id: string }) { requestRefresh(svc.id) }
function refreshComposite(c: { children: { id: string; enabled: boolean }[] }) {
  c.children.filter(ch => ch.enabled).forEach(ch => requestRefresh(ch.id))
}

const selectedService = ref<ServiceConfig | null>(null);
const historyOpen = ref(false);
const selectedComposite = ref<CompositeServiceConfig | null>(null);
const compositeDetailOpen = ref(false);

function compositeSnapshot(composite: CompositeServiceConfig) {
  const children = composite.children.filter((ch) => ch.enabled);
  const level = worstChildLevel(composite);
  const total = children.length;

  // Collect all incidents + entries of children for the summary
  const allItems = children.flatMap((ch) => {
    const snap = currentStatus.value[ch.id];
    if (!snap) return [];
    return [...(snap.incidents ?? []), ...(snap.entries ?? [])];
  });

  const summary = buildSummary(allItems);

  const degraded = children.filter((ch) => {
    const l = currentStatus.value[ch.id]?.level;
    return l && l !== "operational" && l !== "inconnu";
  }).length;

  const message =
    summary?.text ||
    (degraded > 0
      ? `${degraded} of ${total} services degraded`
      : total > 0
        ? `All ${total} services operational`
        : "No sub-services");

  return {
    serviceId: composite.id,
    timestamp: "",
    level,
    message,
    incidents: [],
  };
}

function worstChildLevel(composite: CompositeServiceConfig): StatusLevel {
  const levels = composite.children
    .filter((ch) => ch.enabled)
    .map((ch) => currentStatus.value[ch.id]?.level)
    .filter(Boolean) as StatusLevel[];
  return levels.length ? worstLevel(levels) : "operational";
}

function openCompositeDetail(composite: CompositeServiceConfig) {
  selectedComposite.value = composite;
  compositeDetailOpen.value = true;
}

// Group services + composites together
const groupedServices = computed(() => {
  type Item = {
    type: "service" | "composite";
    item:
      | (typeof enabledServices.value)[number]
      | (typeof enabledComposites.value)[number];
  };
  const map = new Map<string, Item[]>();

  for (const svc of enabledServices.value) {
    const key = svc.group?.trim() || "";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push({ type: "service", item: svc });
  }
  for (const c of enabledComposites.value) {
    const key = c.group?.trim() || "";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push({ type: "composite", item: c });
  }

  const named = [...map.entries()]
    .filter(([k]) => k !== "")
    .sort(([a], [b]) => a.localeCompare(b));
  const ungrouped = map.get("") ?? [];
  return { named, ungrouped };
});

const hasGroups = computed(() => groupedServices.value.named.length > 0);

const monitoredCount = computed(
  () => enabledServices.value.length + enabledComposites.value.length,
);

// Live breakdown across every monitored endpoint (services + composite children)
const stats = computed(() => {
  let total = 0, op = 0, degraded = 0, unknown = 0;
  const tally = (lvl?: StatusLevel) => {
    total++;
    if (!lvl || lvl === "inconnu") unknown++;
    else if (lvl === "operational") op++;
    else degraded++;
  };
  for (const s of enabledServices.value) tally(currentStatus.value[s.id]?.level);
  for (const c of enabledComposites.value)
    for (const ch of c.children)
      if (ch.enabled) tally(currentStatus.value[ch.id]?.level);
  return { total, op, degraded, unknown };
});

const globalLevel = computed(() => {
  // inconnu excluded — blocked proxy or missing auth, not a real incident
  const order = ["operational", "information", "maintenance", "leger", "mineur", "majeur"] as const;
  let worst = 0;
  for (const svc of enabledServices.value) {
    const snap = currentStatus.value[svc.id];
    if (snap && snap.level !== 'inconnu') {
      const idx = order.indexOf(snap.level as (typeof order)[number]);
      if (idx > worst) worst = idx;
    }
  }
  for (const c of enabledComposites.value) {
    for (const ch of c.children) {
      if (!ch.enabled) continue;
      const snap = currentStatus.value[ch.id];
      if (snap && snap.level !== 'inconnu') {
        const idx = order.indexOf(snap.level as (typeof order)[number]);
        if (idx > worst) worst = idx;
      }
    }
  }
  return order[worst];
});

const LEVEL_LABELS_GLOBAL: Record<string, string> = {
  operational:  "All systems operational",
  information:  "Informational notice",
  leger:        "Minor disruption detected",
  mineur:       "Minor incident in progress",
  majeur:       "Major incident in progress",
  maintenance:  "Maintenance in progress",
};

const HERO_GRADIENT: Record<string, string> = {
  operational:  "bg-gradient-to-br from-emerald-500 to-teal-600",
  information:  "bg-gradient-to-br from-violet-500 to-indigo-600",
  leger:        "bg-gradient-to-br from-amber-400 to-yellow-600",
  mineur:       "bg-gradient-to-br from-orange-500 to-amber-600",
  majeur:       "bg-gradient-to-br from-rose-500 to-red-600",
  maintenance:  "bg-gradient-to-br from-sky-500 to-blue-600",
};

function openHistory(service: ServiceConfig) {
  selectedService.value = service;
  historyOpen.value = true;
}
</script>

<template>
  <div class="min-h-screen">
    <AppHeader>
      <template #actions>
        <button
          class="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ring-accent"
          :class="compact ? 'bg-gray-100 text-gray-700 border-gray-200' : 'text-gray-500 border-gray-200 hover:bg-gray-50'"
          @click="toggleCompact"
        >
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <template v-if="!compact">
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" />
            </template>
            <template v-else>
              <rect x="2" y="3" width="6" height="7" rx="1.5" />
              <rect x="9" y="3" width="6" height="7" rx="1.5" />
              <rect x="16" y="3" width="6" height="7" rx="1.5" />
              <rect x="2" y="14" width="6" height="7" rx="1.5" />
              <rect x="9" y="14" width="6" height="7" rx="1.5" />
              <rect x="16" y="14" width="6" height="7" rx="1.5" />
            </template>
          </svg>
          <span class="hidden sm:inline">{{ compact ? 'Normal' : 'Compact' }}</span>
        </button>
      </template>
    </AppHeader>

    <main :class="[containerClass, 'py-8']">
      <!-- Global status hero -->
      <section
        class="rounded-3xl p-6 sm:p-7 mb-8 text-white shadow-lg relative overflow-hidden animate-rise"
        :class="HERO_GRADIENT[globalLevel]"
      >
        <div class="absolute -right-10 -top-16 w-64 h-64 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        <div class="absolute -left-12 -bottom-20 w-56 h-56 rounded-full bg-black/10 blur-2xl pointer-events-none" />
        <div class="relative flex items-center gap-5">
          <div class="w-14 h-14 rounded-2xl bg-white/15 ring-1 ring-white/25 flex items-center justify-center shrink-0 backdrop-blur">
            <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path v-if="globalLevel === 'operational'" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M5 13l4 4L19 7" />
              <path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-xl sm:text-2xl font-bold tracking-tight">{{ LEVEL_LABELS_GLOBAL[globalLevel] }}</p>
            <p class="text-white/80 text-sm mt-0.5 flex items-center gap-2">
              <span class="inline-flex items-center gap-1.5">
                <span class="relative flex h-2 w-2">
                  <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-white/70 opacity-75" />
                  <span class="relative inline-flex rounded-full h-2 w-2 bg-white" />
                </span>
                Live
              </span>
              · {{ monitoredCount }} service{{ monitoredCount > 1 ? 's' : '' }} monitored
            </p>
          </div>
          <div class="hidden sm:flex items-center gap-2">
            <div class="flex items-center gap-2 rounded-full bg-white/15 ring-1 ring-white/20 px-3.5 py-1.5 text-sm backdrop-blur">
              <span class="w-2 h-2 rounded-full bg-white" />
              <span class="font-semibold">{{ stats.op }}</span>
              <span class="text-white/75">healthy</span>
            </div>
            <div
              v-if="stats.degraded > 0"
              class="flex items-center gap-2 rounded-full bg-white/15 ring-1 ring-white/20 px-3.5 py-1.5 text-sm backdrop-blur"
            >
              <span class="w-2 h-2 rounded-full bg-white animate-pulse" />
              <span class="font-semibold">{{ stats.degraded }}</span>
              <span class="text-white/75">degraded</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Empty state -->
      <div
        v-if="enabledServices.length === 0 && enabledComposites.length === 0"
        class="text-center py-20"
      >
        <div class="w-16 h-16 rounded-2xl bg-white border border-gray-100 shadow-sm flex items-center justify-center mx-auto mb-4">
          <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <h3 class="font-semibold text-gray-900 mb-1">No services configured</h3>
        <p class="text-gray-500 text-sm mb-5">Add services to start monitoring</p>
        <NuxtLink
          to="/services"
          class="inline-flex items-center gap-2 px-4 py-2 bg-accent text-white text-sm font-medium rounded-xl shadow-sm hover:opacity-90 transition-opacity"
        >
          Manage services →
        </NuxtLink>
      </div>

      <!-- Services — grouped or flat -->
      <div
        v-else-if="enabledServices.length > 0 || enabledComposites.length > 0"
        class="space-y-10"
      >
        <!-- Named groups -->
        <template v-if="hasGroups">
          <section v-for="[group, items] in groupedServices.named" :key="group" class="animate-rise">
            <h2 class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <span>{{ group }}</span>
              <span class="h-px flex-1 bg-gray-200/70" />
              <span class="text-[11px] font-medium normal-case text-gray-400">{{ items.length }}</span>
            </h2>
            <div :class="gridClass">
              <template v-for="entry in items" :key="entry.item.id">
                <ServiceCard
                  v-if="entry.type === 'composite'"
                  :name="entry.item.name"
                  :snapshot="compositeSnapshot(entry.item as any)"
                  :loading="(entry.item as any).children.some((ch: any) => loading[ch.id])"
                  :sub-services="(entry.item as any).children.filter((ch: any) => ch.enabled).map((ch: any) => ({ id: ch.id, name: ch.name, level: currentStatus[ch.id]?.level, timestamp: currentStatus[ch.id]?.timestamp }))"
                  :compact="compact"
                  @click="openCompositeDetail(entry.item as any)"
                  @refresh="refreshComposite(entry.item as any)"
                />
                <ServiceCard
                  v-else
                  :name="entry.item.name"
                  :snapshot="currentStatus[entry.item.id]"
                  :loading="loading[entry.item.id]"
                  :error="errors[entry.item.id]"
                  :compact="compact"
                  @click="openHistory(entry.item as any)"
                  @refresh="refreshService(entry.item as any)"
                />
              </template>
            </div>
          </section>

          <!-- Ungrouped -->
          <section v-if="groupedServices.ungrouped.length > 0" class="animate-rise">
            <h2 class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <span>Ungrouped</span>
              <span class="h-px flex-1 bg-gray-200/70" />
            </h2>
            <div :class="gridClass">
              <template v-for="entry in groupedServices.ungrouped" :key="entry.item.id">
                <ServiceCard
                  v-if="entry.type === 'composite'"
                  :name="entry.item.name"
                  :snapshot="compositeSnapshot(entry.item as any)"
                  :loading="(entry.item as any).children.some((ch: any) => loading[ch.id])"
                  :sub-services="(entry.item as any).children.filter((ch: any) => ch.enabled).map((ch: any) => ({ id: ch.id, name: ch.name, level: currentStatus[ch.id]?.level, timestamp: currentStatus[ch.id]?.timestamp }))"
                  :compact="compact"
                  @click="openCompositeDetail(entry.item as any)"
                  @refresh="refreshComposite(entry.item as any)"
                />
                <ServiceCard
                  v-else
                  :name="entry.item.name"
                  :snapshot="currentStatus[entry.item.id]"
                  :loading="loading[entry.item.id]"
                  :error="errors[entry.item.id]"
                  :compact="compact"
                  @click="openHistory(entry.item as any)"
                  @refresh="refreshService(entry.item as any)"
                />
              </template>
            </div>
          </section>
        </template>

        <!-- No groups → flat -->
        <div
          v-else
          :class="gridClass"
          class="animate-rise"
        >
          <ServiceCard
            v-for="c in enabledComposites"
            :key="c.id"
            :name="c.name"
            :snapshot="compositeSnapshot(c)"
            :loading="c.children.some((ch) => loading[ch.id])"
            :sub-services="c.children.filter((ch) => ch.enabled).map((ch) => ({ id: ch.id, name: ch.name, level: currentStatus[ch.id]?.level, timestamp: currentStatus[ch.id]?.timestamp }))"
            :compact="compact"
            @click="openCompositeDetail(c)"
            @refresh="refreshComposite(c)"
          />
          <ServiceCard
            v-for="svc in enabledServices"
            :key="svc.id"
            :name="svc.name"
            :snapshot="currentStatus[svc.id]"
            :loading="loading[svc.id]"
            :error="errors[svc.id]"
            :compact="compact"
            @click="openHistory(svc)"
            @refresh="refreshService(svc)"
          />
        </div>
      </div>
    </main>

    <HistoryModal
      v-if="selectedService"
      :open="historyOpen"
      :service="selectedService"
      :current="currentStatus[selectedService.id]"
      :snapshots="getHistory(selectedService.id)"
      @close="historyOpen = false"
    />
    <CompositeDetailModal
      v-if="selectedComposite"
      :open="compositeDetailOpen"
      :composite="selectedComposite"
      @close="compositeDetailOpen = false"
    />
  </div>
</template>
