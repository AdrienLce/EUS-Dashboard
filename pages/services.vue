<script setup lang="ts">
import type { ServiceConfig, CompositeServiceConfig } from "~/types";
import { useServices } from "~/composables/useServices";
import { useComposites } from "~/composables/useComposites";
import { useStatusStore } from "~/composables/useStatusStore";
import { useOrdering } from "~/composables/useOrdering";

const levelConfigOpen = ref(false);

useHead({ title: "Services — Status Concentrateur" });

const { services, addService, updateService, removeService, toggleService } =
  useServices();
const {
  composites,
  addComposite,
  updateComposite,
  removeComposite,
  toggleComposite,
} = useComposites();
const { currentStatus, clearHistory } = useStatusStore();

// ── Choix du type à l'ajout ─────────────────────────────────
const typePickerOpen = ref(false);

function openAdd() {
  typePickerOpen.value = true;
}
function pickType(type: "service" | "composite") {
  typePickerOpen.value = false;
  if (type === "service") {
    editingService.value = null;
    formOpen.value = true;
  } else {
    editingComposite.value = null;
    compositeFormOpen.value = true;
  }
}

// ── Service simple ───────────────────────────────────────────
const formOpen = ref(false);
const editingService = ref<ServiceConfig | null>(null);
const deleteConfirm = ref<string | null>(null);

function openEdit(svc: ServiceConfig) {
  editingService.value = svc;
  formOpen.value = true;
}

function onSave(config: Omit<ServiceConfig, "id" | "createdAt">) {
  if (editingService.value) updateService(editingService.value.id, config);
  else addService(config);
  formOpen.value = false;
}

function confirmDelete(id: string) {
  deleteConfirm.value = id;
}
function doDelete(id: string) {
  removeService(id);
  clearHistory(id);
  deleteConfirm.value = null;
}

// ── Composite ────────────────────────────────────────────────
const compositeFormOpen = ref(false);
const editingComposite = ref<CompositeServiceConfig | null>(null);
const deleteCompositeConfirm = ref<string | null>(null);

function openEditComposite(c: CompositeServiceConfig) {
  editingComposite.value = c;
  compositeFormOpen.value = true;
}

function onSaveComposite(
  config: Omit<CompositeServiceConfig, "id" | "createdAt" | "type">,
) {
  if (editingComposite.value)
    updateComposite(editingComposite.value.id, config);
  else addComposite(config);
  compositeFormOpen.value = false;
}

function doDeleteComposite(id: string) {
  const c = composites.value.find((c) => c.id === id);
  if (c) {
    for (const ch of c.children) clearHistory(ch.id);
  }
  removeComposite(id);
  deleteCompositeConfirm.value = null;
}

const ADAPTER_LABELS: Record<string, string> = {
  github: "GitHub Status",
  atlassian: "Atlassian",
  notion: "Notion",
  aws: "AWS",
  azuredevops: "Azure DevOps",
  rss: "RSS",
  custom: "Custom",
  auto: "Auto",
};

const totalCount = computed(
  () => services.value.length + composites.value.length,
);

// ── Ordering & DnD ───────────────────────────────────────────
const { sortItems, setOrder } = useOrdering();

type AnyItem = { id: string; type?: string };
const allItems = computed((): AnyItem[] => {
  const svcs = services.value.map((s) => ({ ...s, _kind: "service" as const }));
  const comps = composites.value.map((c) => ({
    ...c,
    _kind: "composite" as const,
  }));
  return sortItems([...svcs, ...comps] as AnyItem[]);
});

function isCompositeItem(
  item: AnyItem,
): item is CompositeServiceConfig & { _kind: "composite" } {
  return (item as any)._kind === "composite";
}

// DnD state
const dragIndex = ref<number | null>(null);
const dragOverIndex = ref<number | null>(null);

function onDragStart(i: number, e: DragEvent) {
  dragIndex.value = i;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(i));
  }
}

function onDragOver(i: number, e: DragEvent) {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  dragOverIndex.value = i;
}

function onDrop(i: number) {
  if (dragIndex.value === null || dragIndex.value === i) {
    dragIndex.value = null;
    dragOverIndex.value = null;
    return;
  }
  const list = [...allItems.value];
  const [moved] = list.splice(dragIndex.value, 1);
  list.splice(i, 0, moved);
  setOrder(list.map((item) => item.id));
  dragIndex.value = null;
  dragOverIndex.value = null;
}

function onDragEnd() {
  dragIndex.value = null;
  dragOverIndex.value = null;
}
</script>

<template>
  <div>
    <!-- Nav -->
    <nav class="bg-white border-b border-gray-100 sticky top-0 z-40">
      <div
        class="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between"
      >
        <div class="flex items-center gap-3">
          <NuxtLink
            to="/"
            class="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
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
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </NuxtLink>
          <span class="font-semibold text-gray-900">Gestion des services</span>
          <span
            v-if="totalCount > 0"
            class="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5"
            >{{ totalCount }}</span
          >
        </div>
        <div class="flex items-center gap-2">
          <!-- Personnaliser les niveaux -->
          <button
            class="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            @click="levelConfigOpen = true"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"/></svg>
            Niveaux
          </button>
          <button
            class="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
            @click="openAdd"
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
              d="M12 4v16m8-8H4"
            />
          </svg>
          Ajouter
          </button>
        </div>
      </div>
    </nav>
    <LevelConfigModal :open="levelConfigOpen" @close="levelConfigOpen = false" />

    <main class="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-3">
      <!-- Empty state -->
      <div v-if="totalCount === 0" class="text-center py-20">
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
              d="M5 12h14M12 5l7 7-7 7"
            />
          </svg>
        </div>
        <h3 class="font-semibold text-gray-900 mb-1">Aucun service</h3>
        <p class="text-gray-500 text-sm mb-5">
          Ajoutez votre premier service à surveiller
        </p>
        <button
          class="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
          @click="openAdd"
        >
          + Ajouter un service
        </button>
      </div>

      <!-- Liste unifiée avec DnD -->
      <div
        v-for="(item, i) in allItems"
        :key="item.id"
        draggable="true"
        class="bg-white rounded-xl border shadow-sm transition-all select-none"
        :class="[
          dragOverIndex === i && dragIndex !== i
            ? 'border-blue-400 scale-[1.01]'
            : 'border-gray-100',
          dragIndex === i ? 'opacity-40' : '',
          isCompositeItem(item) ? 'p-4' : 'p-4 flex items-center gap-4',
          !(item as any).enabled ? 'opacity-60' : '',
        ]"
        @dragstart="onDragStart(i, $event)"
        @dragover="onDragOver(i, $event)"
        @drop="onDrop(i)"
        @dragend="onDragEnd"
      >
        <!-- Handle drag -->
        <div
          v-if="!isCompositeItem(item)"
          class="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-400 shrink-0 mr-0"
        >
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="9" cy="6" r="1.5" />
            <circle cx="15" cy="6" r="1.5" />
            <circle cx="9" cy="12" r="1.5" />
            <circle cx="15" cy="12" r="1.5" />
            <circle cx="9" cy="18" r="1.5" />
            <circle cx="15" cy="18" r="1.5" />
          </svg>
        </div>

        <!-- Service simple -->
        <template v-if="!isCompositeItem(item)">
          <button
            class="shrink-0 relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
            :class="(item as any).enabled ? 'bg-green-500' : 'bg-gray-200'"
            @click="toggleService(item.id)"
          >
            <span
              class="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
              :class="
                (item as any).enabled ? 'translate-x-4' : 'translate-x-0.5'
              "
            />
          </button>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="font-medium text-gray-900 truncate">{{
                (item as any).name
              }}</span>
              <StatusBadge
                v-if="currentStatus[item.id]"
                :level="currentStatus[item.id].level"
                size="sm"
              />
              <span
                v-if="(item as any).group"
                class="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600"
                >{{ (item as any).group }}</span
              >
            </div>
            <div class="flex items-center gap-3 mt-1 text-xs text-gray-400">
              <span class="truncate max-w-xs">{{ (item as any).url }}</span>
              <span class="shrink-0">{{
                ADAPTER_LABELS[(item as any).adapter] ?? (item as any).adapter
              }}</span>
              <span class="shrink-0">{{ (item as any).pollInterval }}s</span>
            </div>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <button
              class="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              @click="openEdit(item as ServiceConfig)"
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
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
            </button>
            <button
              v-if="deleteConfirm === item.id"
              class="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100 transition-colors"
              @click="doDelete(item.id)"
            >
              Confirmer
            </button>
            <button
              v-else
              class="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              @click="confirmDelete(item.id)"
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
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </div>
        </template>

        <!-- Composite -->
        <template v-else>
          <div class="flex items-center gap-4">
            <div
              class="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-400 shrink-0"
            >
              <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="9" cy="6" r="1.5" />
                <circle cx="15" cy="6" r="1.5" />
                <circle cx="9" cy="12" r="1.5" />
                <circle cx="15" cy="12" r="1.5" />
                <circle cx="9" cy="18" r="1.5" />
                <circle cx="15" cy="18" r="1.5" />
              </svg>
            </div>
            <button
              class="shrink-0 relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
              :class="item.enabled ? 'bg-green-500' : 'bg-gray-200'"
              @click="toggleComposite(item.id)"
            >
              <span
                class="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
                :class="item.enabled ? 'translate-x-4' : 'translate-x-0.5'"
              />
            </button>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <svg
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
                <span class="font-medium text-gray-900">{{ item.name }}</span>
                <span
                  v-if="item.group"
                  class="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600"
                  >{{ item.group }}</span
                >
              </div>
              <p class="text-xs text-gray-400 mt-0.5">
                {{ item.children.length }} sous-service{{
                  item.children.length > 1 ? "s" : ""
                }}
                · {{ item.pollInterval }}s
              </p>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <button
                class="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                @click="openEditComposite(item)"
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
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
              </button>
              <button
                v-if="deleteCompositeConfirm === item.id"
                class="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100 transition-colors"
                @click="doDeleteComposite(item.id)"
              >
                Confirmer
              </button>
              <button
                v-else
                class="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                @click="deleteCompositeConfirm = item.id"
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
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </div>
          </div>
          <div class="mt-3 flex flex-wrap gap-1.5 pl-9">
            <span
              v-for="ch in item.children"
              :key="ch.id"
              class="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500"
              :class="{ 'opacity-40 line-through': !ch.enabled }"
              >{{ ch.name }}</span
            >
          </div>
        </template>
      </div>

      <!-- Légende -->
      <div
        v-if="totalCount > 0"
        class="mt-4 p-4 rounded-xl bg-white border border-gray-100"
      >
        <p
          class="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3"
        >
          Légende des niveaux
        </p>
        <div class="flex flex-wrap gap-3">
          <StatusBadge level="operational" size="sm" />
          <StatusBadge level="leger" size="sm" />
          <StatusBadge level="mineur" size="sm" />
          <StatusBadge level="majeur" size="sm" />
          <StatusBadge level="maintenance" size="sm" />
        </div>
      </div>
    </main>

    <!-- Type picker modal -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-150"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
      >
        <div
          v-if="typePickerOpen"
          class="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            class="absolute inset-0 bg-black/40 backdrop-blur-sm"
            @click="typePickerOpen = false"
          />
          <div
            class="relative bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-3"
          >
            <h2 class="font-semibold text-gray-900 text-lg mb-4">
              Ajouter un service
            </h2>
            <button
              class="w-full flex items-start gap-4 p-4 rounded-xl border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-colors text-left"
              @click="pickType('service')"
            >
              <div
                class="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0"
              >
                <svg
                  class="w-5 h-5 text-gray-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              </div>
              <div>
                <p class="font-medium text-gray-900">Service unique</p>
                <p class="text-sm text-gray-500 mt-0.5">
                  Un seul endpoint surveillé (RSS, JSON, API…)
                </p>
              </div>
            </button>
            <button
              class="w-full flex items-start gap-4 p-4 rounded-xl border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-colors text-left"
              @click="pickType('composite')"
            >
              <div
                class="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0"
              >
                <svg
                  class="w-5 h-5 text-gray-600"
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
              </div>
              <div>
                <p class="font-medium text-gray-900">Groupe de services</p>
                <p class="text-sm text-gray-500 mt-0.5">
                  Aggrège plusieurs sous-services sous une carte
                </p>
              </div>
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>

    <ServiceForm
      :open="formOpen"
      :editing="editingService"
      @close="formOpen = false"
      @save="onSave"
    />
    <CompositeForm
      :open="compositeFormOpen"
      :editing="editingComposite"
      @close="compositeFormOpen = false"
      @save="onSaveComposite"
    />
  </div>
</template>
