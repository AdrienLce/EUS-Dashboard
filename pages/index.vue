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
import { usePolling } from "~/composables/usePolling";

useHead({ title: "Dashboard — Status Concentrateur" });

const { compact, toggle: toggleCompact, pageStyle } = useDisplayMode();
const containerClass = computed(() => pageStyle.value === 'large' ? 'w-full px-4 sm:px-6' : 'max-w-6xl mx-auto px-4 sm:px-6')

const gridClass = computed(() => {
  const isLarge = pageStyle.value === 'large'
  if (compact.value) return isLarge
    ? 'grid gap-1 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8'
    : 'grid gap-1 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
  return isLarge
    ? 'grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5'
    : 'grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
})
const { enabledServices } = useServices();
const { enabledComposites } = useComposites();
const { currentStatus, getHistory } = useStatusStore();
const { loading, errors, refreshService, refreshComposite } = usePolling();

const selectedService = ref<ServiceConfig | null>(null);
const historyOpen = ref(false);
const selectedComposite = ref<CompositeServiceConfig | null>(null);
const compositeDetailOpen = ref(false);

function compositeSnapshot(composite: CompositeServiceConfig) {
  const children = composite.children.filter((ch) => ch.enabled);
  const level = worstChildLevel(composite);
  const total = children.length;

  // Collecter tous les incidents + entries des enfants pour le résumé
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
      ? `${degraded} service${degraded > 1 ? "s" : ""} dégradé${degraded > 1 ? "s" : ""} sur ${total}`
      : total > 0
        ? `${total} service${total > 1 ? "s" : ""} opérationnel${total > 1 ? "s" : ""}`
        : "Aucun sous-service");

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

// Groupement services + composites ensemble
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

const globalLevel = computed(() => {
  // inconnu exclu — proxy bloqué ou auth manquante, pas un incident réel
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
  operational:  "Tous les services opérationnels",
  information:  "Message informatif",
  leger:        "Légère perturbation détectée",
  mineur:       "Incident mineur en cours",
  majeur:       "Incident majeur en cours",
  maintenance:  "Maintenance en cours",
};

const GLOBAL_COLORS: Record<string, string> = {
  operational:  "bg-green-500",
  information:  "bg-violet-500",
  leger:        "bg-yellow-500",
  mineur:       "bg-orange-500",
  majeur:       "bg-red-500",
  maintenance:  "bg-blue-500",
};

function openHistory(service: ServiceConfig) {
  selectedService.value = service;
  historyOpen.value = true;
}

</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Nav -->
    <nav class="bg-white border-b border-gray-100 sticky top-0 z-40">
      <div
        :class="[containerClass, 'h-14 flex items-center justify-between']"
      >
        <div class="flex items-center gap-3">
          <div
            class="w-7 h-7 rounded-lg bg-gray-900 flex items-center justify-center"
          >
            <svg
              class="w-4 h-4 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </div>
          <span class="font-semibold text-gray-900">Status Dashboard</span>
        </div>

        <div class="flex items-center gap-2">
          <!-- Toggle compact -->
          <button
            class="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg transition-colors"
            :class="compact ? 'bg-gray-100 text-gray-700 border-gray-200' : 'text-gray-500 border-gray-200 hover:bg-gray-50'"
            @click="toggleCompact"
          >
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <!-- Non-compact : grille 2x2 (4 cases) -->
              <template v-if="!compact">
                <rect
                  x="3"
                  y="3"
                  width="7"
                  height="7"
                  rx="1"
                  fill="currentColor"
                />
                <rect
                  x="14"
                  y="3"
                  width="7"
                  height="7"
                  rx="1"
                  fill="currentColor"
                />
                <rect
                  x="3"
                  y="14"
                  width="7"
                  height="7"
                  rx="1"
                  fill="currentColor"
                />
                <rect
                  x="14"
                  y="14"
                  width="7"
                  height="7"
                  rx="1"
                  fill="currentColor"
                />
              </template>
              <!-- Compact : grille 3x2 (6 cases) -->
              <template v-else>
                <rect
                  x="2"
                  y="3"
                  width="6"
                  height="7"
                  rx="1"
                  fill="currentColor"
                />
                <rect
                  x="9"
                  y="3"
                  width="6"
                  height="7"
                  rx="1"
                  fill="currentColor"
                />
                <rect
                  x="16"
                  y="3"
                  width="6"
                  height="7"
                  rx="1"
                  fill="currentColor"
                />
                <rect
                  x="2"
                  y="14"
                  width="6"
                  height="7"
                  rx="1"
                  fill="currentColor"
                />
                <rect
                  x="9"
                  y="14"
                  width="6"
                  height="7"
                  rx="1"
                  fill="currentColor"
                />
                <rect
                  x="16"
                  y="14"
                  width="6"
                  height="7"
                  rx="1"
                  fill="currentColor"
                />
              </template>
            </svg>
            {{ compact ? 'Normal' : 'Compact' }}
          </button>

          <NuxtLink to="/settings" class="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"/></svg>
            Paramètres
          </NuxtLink>
          <NuxtLink to="/services" class="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            Gérer
          </NuxtLink>
        </div>
      </div>
    </nav>

    <main :class="[containerClass, 'py-8']">
      <!-- Global status banner -->
      <div
        class="rounded-2xl p-5 mb-8 flex items-center gap-4 text-white"
        :class="GLOBAL_COLORS[globalLevel]"
      >
        <div
          class="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0"
        >
          <svg
            class="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              v-if="globalLevel === 'operational'"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M5 13l4 4L19 7"
            />
            <path
              v-else
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
            />
          </svg>
        </div>
        <div>
          <p class="font-semibold text-lg">
            {{ LEVEL_LABELS_GLOBAL[globalLevel] }}
          </p>
          <p class="text-white/80 text-sm">
            {{ enabledServices.length + enabledComposites.length }} service{{
              enabledServices.length + enabledComposites.length > 1 ? "s" : ""
            }}
            surveillé{{
              enabledServices.length + enabledComposites.length > 1 ? "s" : ""
            }}
          </p>
        </div>
      </div>

      <!-- Empty state -->
      <div
        v-if="enabledServices.length === 0 && enabledComposites.length === 0"
        class="text-center py-20"
      >
        <div
          class="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4"
        >
          <svg
            class="w-8 h-8 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
        </div>
        <h3 class="font-semibold text-gray-900 mb-1">
          Aucun service configuré
        </h3>
        <p class="text-gray-500 text-sm mb-5">
          Ajoutez des services pour commencer la surveillance
        </p>
        <NuxtLink
          to="/services"
          class="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
        >
          Gérer les services →
        </NuxtLink>
      </div>

      <!-- Services — groupés ou flat -->
      <div
        v-else-if="enabledServices.length > 0 || enabledComposites.length > 0"
        class="space-y-8"
      >
        <!-- Groupes nommés -->
        <template v-if="hasGroups">
          <section v-for="[group, items] in groupedServices.named" :key="group">
            <h2
              class="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2"
            >
              <span>{{ group }}</span>
              <span class="text-xs font-normal normal-case text-gray-400"
                >{{ items.length }} service{{
                  items.length > 1 ? "s" : ""
                }}</span
              >
            </h2>
            <div
              :class="gridClass"
            >
              <template v-for="entry in items" :key="entry.item.id">
                <ServiceCard
                  v-if="entry.type === 'composite'"
                  :name="entry.item.name"
                  :snapshot="compositeSnapshot(entry.item as any)"
                  :loading="
                    (entry.item as any).children.some(
                      (ch: any) => loading[ch.id],
                    )
                  "
                  :sub-services="
                    (entry.item as any).children
                      .filter((ch: any) => ch.enabled)
                      .map((ch: any) => ({
                        id: ch.id,
                        name: ch.name,
                        level: currentStatus[ch.id]?.level,
                        timestamp: currentStatus[ch.id]?.timestamp,
                      }))
                  "
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

          <!-- Sans groupe -->
          <section v-if="groupedServices.ungrouped.length > 0">
            <h2
              class="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3"
            >
              Sans section
            </h2>
            <div
              :class="gridClass"
            >
              <template
                v-for="entry in groupedServices.ungrouped"
                :key="entry.item.id"
              >
                <ServiceCard
                  v-if="entry.type === 'composite'"
                  :name="entry.item.name"
                  :snapshot="compositeSnapshot(entry.item as any)"
                  :loading="
                    (entry.item as any).children.some(
                      (ch: any) => loading[ch.id],
                    )
                  "
                  :sub-services="
                    (entry.item as any).children
                      .filter((ch: any) => ch.enabled)
                      .map((ch: any) => ({
                        id: ch.id,
                        name: ch.name,
                        level: currentStatus[ch.id]?.level,
                        timestamp: currentStatus[ch.id]?.timestamp,
                      }))
                  "
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

        <!-- Pas de groupes → affichage flat -->
        <div
          v-else
          :class="
            compact
              ? 'grid gap-1 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
              : 'grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
          "
        >
          <ServiceCard
            v-for="c in enabledComposites"
            :key="c.id"
            :name="c.name"
            :snapshot="compositeSnapshot(c)"
            :loading="c.children.some((ch) => loading[ch.id])"
            :sub-services="
              c.children
                .filter((ch) => ch.enabled)
                .map((ch) => ({
                  id: ch.id,
                  name: ch.name,
                  level: currentStatus[ch.id]?.level,
                  timestamp: currentStatus[ch.id]?.timestamp,
                }))
            "
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
            @click="openHistory(svc)"
            :compact="compact"
            @refresh="refreshService(svc)"
          />
        </div>
      </div>
    </main>

    <HistoryModal
      v-if="selectedService"
      :open="historyOpen"
      :service="selectedService"
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
