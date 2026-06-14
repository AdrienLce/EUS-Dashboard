<script setup lang="ts">
import type { ServiceConfig, CompositeServiceConfig, SubServiceConfig } from "~/types";
import { useServices } from "~/composables/useServices";
import { useComposites } from "~/composables/useComposites";
import { useStatusStore } from "~/composables/useStatusStore";
import { useOrdering } from "~/composables/useOrdering";
import { useDisplayMode } from "~/composables/useDisplayMode";
import { useLevelConfig } from "~/composables/useLevelConfig";
import { useToast } from "~/composables/useToast";

definePageMeta({ middleware: 'auth' })
useHead({ title: "Services — Sentinel" });

const { add: toast } = useToast();

const { services, addService, updateService, removeService, toggleService } =
  useServices();
const {
  composites,
  addComposite,
  updateComposite,
  removeComposite,
  toggleComposite,
} = useComposites();

// ── Move a service into a group ──────────────────────────────
const moveModalOpen = ref(false);
const movingService = ref<ServiceConfig | null>(null);

function openMoveModal(svc: ServiceConfig) {
  movingService.value = svc;
  moveModalOpen.value = true;
}

function moveToComposite(compositeId: string) {
  const svc = movingService.value;
  if (!svc) return;
  const composite = composites.value.find(c => c.id === compositeId);
  if (!composite) return;

  const sub: SubServiceConfig = {
    id: svc.id,
    name: svc.name,
    url: svc.url,
    method: svc.method,
    headers: svc.headers,
    adapter: svc.adapter,
    enabled: svc.enabled,
    ...(svc.body !== undefined && { body: svc.body }),
    ...(svc.customMapping && { customMapping: svc.customMapping }),
  };

  updateComposite(compositeId, { children: [...composite.children, sub] });
  removeService(svc.id);
  moveModalOpen.value = false;
  movingService.value = null;
}
const { currentStatus, clearHistory } = useStatusStore();

// ── Type picker on add ───────────────────────────────────────
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

// ── Simple service ───────────────────────────────────────────
const formOpen = ref(false);
const editingService = ref<ServiceConfig | null>(null);
const deleteConfirm = ref<string | null>(null);

function openEdit(svc: ServiceConfig) {
  editingService.value = svc;
  formOpen.value = true;
}

function onSave(config: Omit<ServiceConfig, "id" | "createdAt">) {
  if (editingService.value) {
    updateService(editingService.value.id, config);
    toast(`"${config.name}" saved`);
  } else {
    const svc = addService(config);
    editingService.value = svc;
    toast(`"${config.name}" added`);
  }
}

function onSaveAndClose(config: Omit<ServiceConfig, "id" | "createdAt">) {
  onSave(config);
  formOpen.value = false;
  editingService.value = null;
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
  if (editingComposite.value) updateComposite(editingComposite.value.id, config);
  else addComposite(config);
  toast(`Group "${config.name}" saved`);
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

const { pageStyle } = useDisplayMode()
const { levels } = useLevelConfig()
const containerClass = computed(() => pageStyle.value === 'large' ? 'w-full px-4 sm:px-6' : 'max-w-7xl mx-auto px-4 sm:px-6')

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
  <div class="min-h-screen">
    <AppHeader :count="totalCount">
      <template #actions>
        <button
          class="flex items-center gap-1.5 px-3.5 py-1.5 bg-accent text-white text-sm font-medium rounded-xl shadow-sm hover:opacity-90 transition-opacity ring-accent"
          @click="openAdd"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          Add
        </button>
      </template>
    </AppHeader>

    <main :class="[containerClass, 'py-8 space-y-3']">
      <!-- Empty state -->
      <div v-if="totalCount === 0" class="text-center py-20">
        <div class="w-16 h-16 rounded-2xl bg-white border border-gray-100 shadow-sm flex items-center justify-center mx-auto mb-4">
          <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </div>
        <h3 class="font-semibold text-gray-900 mb-1">No services yet</h3>
        <p class="text-gray-500 text-sm mb-5">Add your first service to monitor</p>
        <button
          class="inline-flex items-center gap-2 px-4 py-2 bg-accent text-white text-sm font-medium rounded-xl shadow-sm hover:opacity-90 transition-opacity"
          @click="openAdd"
        >
          + Add a service
        </button>
      </div>

      <!-- Unified list with DnD -->
      <div
        v-for="(item, i) in allItems"
        :key="item.id"
        draggable="true"
        class="bg-white rounded-2xl border shadow-sm transition-all select-none"
        :class="[
          dragOverIndex === i && dragIndex !== i ? 'border-indigo-400 scale-[1.01]' : 'border-gray-100',
          dragIndex === i ? 'opacity-40' : '',
          isCompositeItem(item) ? 'p-4' : 'p-4 flex items-center gap-4',
          !(item as any).enabled ? 'opacity-60' : '',
        ]"
        @dragstart="onDragStart(i, $event)"
        @dragover="onDragOver(i, $event)"
        @drop="onDrop(i)"
        @dragend="onDragEnd"
      >
        <!-- Drag handle -->
        <div
          v-if="!isCompositeItem(item)"
          class="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-400 shrink-0"
        >
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
            <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
            <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
          </svg>
        </div>

        <!-- Simple service -->
        <template v-if="!isCompositeItem(item)">
          <button
            class="shrink-0 relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
            :class="(item as any).enabled ? 'bg-emerald-500' : 'bg-gray-200'"
            @click="toggleService(item.id)"
          >
            <span class="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform" :class="(item as any).enabled ? 'translate-x-4' : 'translate-x-0.5'" />
          </button>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="font-medium text-gray-900 truncate">{{ (item as any).name }}</span>
              <StatusBadge v-if="currentStatus[item.id]" :level="currentStatus[item.id].level" size="sm" />
              <span v-if="(item as any).group" class="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">{{ (item as any).group }}</span>
            </div>
            <div class="flex items-center gap-3 mt-1 text-xs text-gray-400">
              <span class="truncate max-w-xs font-mono">{{ (item as any).url }}</span>
              <span class="shrink-0">{{ ADAPTER_LABELS[(item as any).adapter] ?? (item as any).adapter }}</span>
              <span class="shrink-0">{{ (item as any).pollInterval }}s</span>
            </div>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <button
              v-if="composites.length > 0"
              class="p-2 rounded-lg text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 transition-colors"
              title="Move to a group"
              @click="openMoveModal(item as ServiceConfig)"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </button>
            <button class="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors" @click="openEdit(item as ServiceConfig)">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button
              v-if="deleteConfirm === item.id"
              class="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100 transition-colors"
              @click="doDelete(item.id)"
            >
              Confirm
            </button>
            <button v-else class="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" @click="confirmDelete(item.id)">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </template>

        <!-- Composite -->
        <template v-else>
          <div class="flex items-center gap-4">
            <div class="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-400 shrink-0">
              <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
                <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
                <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
              </svg>
            </div>
            <button
              class="shrink-0 relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
              :class="item.enabled ? 'bg-emerald-500' : 'bg-gray-200'"
              @click="toggleComposite(item.id)"
            >
              <span class="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform" :class="item.enabled ? 'translate-x-4' : 'translate-x-0.5'" />
            </button>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <svg class="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <span class="font-medium text-gray-900">{{ item.name }}</span>
                <span class="text-xs px-2 py-0.5 rounded-full bg-violet-50 text-violet-600">Group</span>
                <span v-if="item.group" class="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">{{ item.group }}</span>
              </div>
              <p class="text-xs text-gray-400 mt-0.5">
                {{ item.children.length }} sub-service{{ item.children.length > 1 ? "s" : "" }} · {{ item.pollInterval }}s
              </p>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <button class="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors" @click="openEditComposite(item)">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button
                v-if="deleteCompositeConfirm === item.id"
                class="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100 transition-colors"
                @click="doDeleteComposite(item.id)"
              >
                Confirm
              </button>
              <button v-else class="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" @click="deleteCompositeConfirm = item.id">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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
            >{{ ch.name }}</span>
          </div>
        </template>
      </div>

      <!-- Legend -->
      <div v-if="totalCount > 0" class="mt-4 p-4 rounded-2xl bg-white border border-gray-100 shadow-sm">
        <p class="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Status levels</p>
        <div class="flex flex-wrap gap-3">
          <StatusBadge v-for="lvl in levels" :key="lvl.id" :level="lvl.id" size="sm" />
        </div>
      </div>
    </main>

    <!-- Type picker modal -->
    <Teleport to="body">
      <Transition enter-active-class="transition duration-150" enter-from-class="opacity-0" enter-to-class="opacity-100">
        <div v-if="typePickerOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="typePickerOpen = false" />
          <div class="relative bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-3">
            <h2 class="font-semibold text-gray-900 text-lg mb-4">Add a service</h2>
            <button class="w-full flex items-start gap-4 p-4 rounded-xl border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/50 transition-colors text-left" @click="pickType('service')">
              <div class="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                <svg class="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <p class="font-medium text-gray-900">Single service</p>
                <p class="text-sm text-gray-500 mt-0.5">One monitored endpoint (RSS, JSON, API…)</p>
              </div>
            </button>
            <button class="w-full flex items-start gap-4 p-4 rounded-xl border border-gray-100 hover:border-violet-200 hover:bg-violet-50/50 transition-colors text-left" @click="pickType('composite')">
              <div class="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
                <svg class="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <div>
                <p class="font-medium text-gray-900">Service group</p>
                <p class="text-sm text-gray-500 mt-0.5">Aggregates several sub-services under one card</p>
              </div>
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Move-to-group modal -->
    <Teleport to="body">
      <Transition enter-active-class="transition duration-150" enter-from-class="opacity-0" enter-to-class="opacity-100">
        <div v-if="moveModalOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="moveModalOpen = false" />
          <div class="relative bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-3">
            <h2 class="font-semibold text-gray-900 text-lg">Move to a group</h2>
            <p class="text-sm text-gray-500">
              Choose the group to move
              <span class="font-medium text-gray-900">{{ movingService?.name }}</span> into.
            </p>
            <div class="space-y-2 mt-2">
              <button
                v-for="c in composites"
                :key="c.id"
                class="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors text-left"
                @click="moveToComposite(c.id)"
              >
                <div class="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                  <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <div class="min-w-0">
                  <p class="text-sm font-medium text-gray-900 truncate">{{ c.name }}</p>
                  <p class="text-xs text-gray-400">{{ c.children.length }} sub-service{{ c.children.length !== 1 ? 's' : '' }}</p>
                </div>
              </button>
            </div>
            <button class="w-full text-sm text-gray-400 hover:text-gray-600 pt-1" @click="moveModalOpen = false">Cancel</button>
          </div>
        </div>
      </Transition>
    </Teleport>

    <ServiceForm
      :open="formOpen"
      :editing="editingService"
      @close="formOpen = false; editingService = null"
      @save="onSave"
      @save-and-close="onSaveAndClose"
    />
    <CompositeForm
      :open="compositeFormOpen"
      :editing="editingComposite"
      @close="compositeFormOpen = false"
      @save="onSaveComposite"
    />
  </div>
</template>
