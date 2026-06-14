<script setup lang="ts">
import type {
  CompositeServiceConfig,
  SubServiceConfig,
  ServiceConfig,
  CustomMapping,
} from "~/types";
import { useToast } from "~/composables/useToast";

const { add: toast } = useToast();

const props = defineProps<{
  open: boolean;
  editing?: CompositeServiceConfig | null;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (
    e: "save",
    config: Omit<CompositeServiceConfig, "id" | "createdAt" | "type">,
  ): void;
}>();

const ADAPTERS = [
  { value: "auto", label: "Auto-detect" },
  { value: "rss", label: "RSS / Atom" },
  { value: "atlassian", label: "Atlassian / Statuspage" },
  { value: "github", label: "GitHub Status" },
  { value: "aws", label: "AWS Health" },
  { value: "azuredevops", label: "Azure DevOps" },
  { value: "custom", label: "Custom (mapping)" },
];

const defaultMappingInit = (): CustomMapping => ({
  statusPath: "",
  messagePath: "",
  levelMap: {},
  incidentsPath: "",
  incidentTitlePath: "",
  incidentLevelPath: "",
  incidentMessagePath: "",
});

const form = reactive({
  name: "",
  group: "",
  pollInterval: 300,
  enabled: true,
  children: [] as SubServiceConfig[],
  defaultAdapter: "auto",
  defaultMappingEnabled: false,
  defaultMapping: defaultMappingInit(),
});

// ServiceForm reused for add/edit child
const childFormOpen = ref(false);
const editingChildId = ref<string | null>(null);
// ServiceConfig adapted for ServiceForm (without the required group/pollInterval)
const editingChildAsService = ref<ServiceConfig | null>(null);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    childFormOpen.value = false;
    editingChildId.value = null;

    if (props.editing) {
      form.name = props.editing.name;
      form.group = props.editing.group ?? "";
      form.pollInterval = props.editing.pollInterval;
      form.enabled = props.editing.enabled;
      form.children = props.editing.children.map((c) => ({ ...c }));
      form.defaultAdapter = props.editing.defaultAdapter ?? "auto";
      form.defaultMappingEnabled = !!props.editing.defaultMapping;
      form.defaultMapping = props.editing.defaultMapping
        ? {
            ...defaultMappingInit(),
            ...props.editing.defaultMapping,
            levelMap: { ...props.editing.defaultMapping.levelMap },
          }
        : defaultMappingInit();
    } else {
      form.name = "";
      form.group = "";
      form.pollInterval = 60;
      form.enabled = true;
      form.children = [];
      form.defaultAdapter = "auto";
      form.defaultMappingEnabled = false;
      form.defaultMapping = defaultMappingInit();
    }
  },
);

function openAddChild() {
  editingChildId.value = null;
  editingChildAsService.value = null;
  childFormOpen.value = true;
}

function openEditChild(child: SubServiceConfig) {
  editingChildId.value = child.id;
  // Build a temporary ServiceConfig to pre-fill ServiceForm
  editingChildAsService.value = {
    id: child.id,
    name: child.name,
    url: child.url,
    method: child.method,
    headers: { ...child.headers },
    body: child.body,
    adapter: child.adapter,
    customMapping: child.customMapping,
    enabled: child.enabled,
    group: undefined,
    pollInterval: form.pollInterval,
    createdAt: "",
  };
  childFormOpen.value = true;
}

function applyChildSave(config: Omit<ServiceConfig, "id" | "createdAt">) {
  const sub: SubServiceConfig = {
    id: editingChildId.value ?? crypto.randomUUID(),
    name: config.name,
    url: config.url,
    method: config.method,
    headers: config.headers,
    body: config.body,
    adapter: config.adapter,
    customMapping: config.customMapping,
    enabled: config.enabled,
  };

  if (editingChildId.value) {
    const idx = form.children.findIndex((c) => c.id === editingChildId.value);
    if (idx !== -1) form.children[idx] = sub;
  } else {
    form.children.push(sub);
    editingChildId.value = sub.id;
  }
}

function onChildSave(config: Omit<ServiceConfig, "id" | "createdAt">) {
  applyChildSave(config);
  toast(`"${config.name}" saved`);
}

function onChildSaveAndClose(config: Omit<ServiceConfig, "id" | "createdAt">) {
  applyChildSave(config);
  toast(`"${config.name}" saved`);
  childFormOpen.value = false;
  editingChildId.value = null;
}

function removeChild(id: string) {
  form.children = form.children.filter((c) => c.id !== id);
}

function toggleChildEnabled(id: string) {
  const c = form.children.find((c) => c.id === id);
  if (c) c.enabled = !c.enabled;
}

// ── Sub-services DnD ────────────────────────────────────────
const childDragIndex = ref<number | null>(null);
const childDragOver = ref<number | null>(null);

function onChildDragStart(i: number, e: DragEvent) {
  childDragIndex.value = i;
  if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
}
function onChildDragOver(i: number, e: DragEvent) {
  e.preventDefault();
  childDragOver.value = i;
}
function onChildDrop(i: number) {
  if (childDragIndex.value === null || childDragIndex.value === i) {
    childDragIndex.value = null;
    childDragOver.value = null;
    return;
  }
  const list = [...form.children];
  const [moved] = list.splice(childDragIndex.value, 1);
  list.splice(i, 0, moved);
  form.children = list;
  childDragIndex.value = null;
  childDragOver.value = null;
}
function onChildDragEnd() {
  childDragIndex.value = null;
  childDragOver.value = null;
}

function submit() {
  if (!form.name.trim()) return;
  emit("save", {
    name: form.name.trim(),
    group: form.group || undefined,
    pollInterval: Math.min(Math.max(form.pollInterval, 60), 1200),
    enabled: form.enabled,
    children: form.children,
    defaultAdapter:
      form.defaultAdapter !== "auto" ? form.defaultAdapter : undefined,
    defaultMapping:
      form.defaultMappingEnabled &&
      (form.defaultMapping.statusPath || form.defaultMapping.incidentsPath)
        ? { ...form.defaultMapping }
        : undefined,
  });
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape" && !childFormOpen.value) emit("close");
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
            class="relative w-full max-w-6xl h-full max-h-[75vh] bg-white rounded-2xl shadow-xl flex flex-col"
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
                  {{ editing ? "Edit" : "New" }} service group
                </h2>
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

            <!-- Body — 2 columns -->
            <div class="flex-1 overflow-hidden flex min-h-0">
              <!-- Left column: config -->
              <div
                class="w-1/2 border-r border-gray-100 overflow-y-auto px-6 py-5 space-y-5"
              >
                <!-- Name -->
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1"
                    >Name <span class="text-red-500">*</span></label
                  >
                  <input
                    v-model="form.name"
                    type="text"
                    placeholder="e.g. ICE"
                    class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <!-- Section + Interval -->
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1"
                      >Section</label
                    >
                    <input
                      v-model="form.group"
                      type="text"
                      placeholder="e.g. Trading"
                      class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1"
                      >Interval</label
                    >
                    <select
                      v-model.number="form.pollInterval"
                      class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option v-for="m in 20" :key="m" :value="m * 60">
                        {{ m }} minute{{ m > 1 ? "s" : "" }}
                      </option>
                    </select>
                  </div>
                </div>

                <!-- Global mapping -->
                <div
                  class="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-3"
                >
                  <div class="flex justify-between items-center gap-2">
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
                          d="M13 10V3L4 14h7v7l9-11h-7z"
                        />
                      </svg>
                      <span class="text-sm font-medium text-gray-700"
                        >Default mapping</span
                      >
                      <span class="text-xs text-gray-400"
                        >inherited by default</span
                      >
                    </div>
                    <div class="flex items-center gap-1">
                      <button
                        type="button"
                        class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
                        :class="
                          form.defaultMappingEnabled
                            ? 'bg-blue-500'
                            : 'bg-gray-200'
                        "
                        @click="
                          form.defaultMappingEnabled =
                            !form.defaultMappingEnabled
                        "
                      >
                        <span
                          class="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
                          :class="
                            form.defaultMappingEnabled
                              ? 'translate-x-4'
                              : 'translate-x-0.5'
                          "
                        />
                      </button>
                    </div>
                  </div>

                  <template v-if="form.defaultMappingEnabled">
                    <div>
                      <label class="block text-xs text-gray-500 mb-1"
                        >Default adapter</label
                      >
                      <select
                        v-model="form.defaultAdapter"
                        class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      >
                        <option
                          v-for="a in ADAPTERS"
                          :key="a.value"
                          :value="a.value"
                        >
                          {{ a.label }}
                        </option>
                      </select>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                      <div>
                        <label class="block text-xs text-gray-500 mb-1"
                          >Status path</label
                        >
                        <input
                          v-model="form.defaultMapping.statusPath"
                          type="text"
                          placeholder="e.g. entries.0.title"
                          class="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        />
                      </div>
                      <div>
                        <label class="block text-xs text-gray-500 mb-1"
                          >Message path</label
                        >
                        <input
                          v-model="form.defaultMapping.messagePath"
                          type="text"
                          placeholder="e.g. entries.*.summary"
                          class="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        />
                      </div>
                    </div>

                    <!-- Incidents (optional) -->
                    <div class="space-y-2">
                      <label class="block text-xs text-gray-500"
                        >Incidents path (list)
                        <span class="text-gray-400 font-normal">— optional</span></label
                      >
                      <input
                        v-model="form.defaultMapping.incidentsPath"
                        type="text"
                        placeholder="e.g. incidents · result.incidents"
                        class="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                      <div
                        v-if="form.defaultMapping.incidentsPath"
                        class="grid grid-cols-3 gap-2"
                      >
                        <input
                          v-model="form.defaultMapping.incidentTitlePath"
                          type="text"
                          placeholder="title (name)"
                          class="w-full rounded border border-gray-200 px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                        />
                        <input
                          v-model="form.defaultMapping.incidentLevelPath"
                          type="text"
                          placeholder="level (impact)"
                          class="w-full rounded border border-gray-200 px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                        />
                        <input
                          v-model="form.defaultMapping.incidentMessagePath"
                          type="text"
                          placeholder="message (body)"
                          class="w-full rounded border border-gray-200 px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                        />
                      </div>
                    </div>

                    <!-- levelMap -->
                    <div>
                      <div class="flex items-center justify-between mb-2">
                        <label class="text-xs text-gray-500"
                          >Mapping table</label
                        >
                        <button
                          type="button"
                          class="text-xs text-indigo-500 hover:text-indigo-700"
                          @click="
                            form.defaultMapping.levelMap[''] = 'operational'
                          "
                        >
                          + Add
                        </button>
                      </div>
                      <div class="space-y-1.5">
                        <div
                          v-for="(_, key) in form.defaultMapping.levelMap"
                          :key="key"
                          class="flex items-center gap-2"
                        >
                          <input
                            :value="key"
                            type="text"
                            placeholder="API value"
                            class="flex-1 rounded border border-gray-200 px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                            @change="
                              (e) => {
                                const newKey = (e.target as HTMLInputElement)
                                  .value;
                                const val = form.defaultMapping.levelMap[key];
                                delete form.defaultMapping.levelMap[key];
                                form.defaultMapping.levelMap[newKey] = val;
                              }
                            "
                          />
                          <span class="text-gray-300 text-xs">→</span>
                          <select
                            v-model="form.defaultMapping.levelMap[key]"
                            class="rounded border border-gray-200 px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="operational">Operational</option>
                            <option value="information">Information</option>
                            <option value="leger">Light</option>
                            <option value="mineur">Minor</option>
                            <option value="majeur">Major</option>
                            <option value="critique">Critical</option>
                            <option value="maintenance">Maintenance</option>
                            <option value="inconnu">Unknown</option>
                          </select>
                          <button
                            type="button"
                            class="text-gray-300 hover:text-red-400 transition-colors"
                            @click="delete form.defaultMapping.levelMap[key]"
                          >
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
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>
                      <p class="text-xs text-gray-400 mt-2">
                        Sub-services with their own mapping take priority.
                      </p>
                    </div>
                  </template>
                </div>
              </div>

              <!-- Right column: sub-services -->
              <div class="w-1/2 overflow-y-auto px-6 py-5 flex flex-col gap-4">
                <div class="flex items-center justify-between">
                  <h3 class="text-sm font-medium text-gray-700">
                    Sub-services
                    <span class="text-gray-400 font-normal"
                      >({{ form.children.length }})</span
                    >
                  </h3>
                  <button
                    class="flex items-center gap-1 px-3 py-1.5 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors"
                    @click="openAddChild"
                  >
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
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                    Add
                  </button>
                </div>

                <div
                  v-if="form.children.length === 0"
                  class="flex-1 flex items-center justify-center rounded-xl border border-dashed border-gray-200 text-gray-400 text-sm py-12"
                >
                  No sub-services
                </div>

                <div v-else class="space-y-2">
                  <div
                    v-for="(child, ci) in form.children"
                    :key="child.id"
                    draggable="true"
                    class="flex items-center gap-3 p-3 rounded-lg border bg-gray-50 transition-all select-none"
                    :class="[
                      childDragOver === ci && childDragIndex !== ci
                        ? 'border-blue-400 scale-[1.01]'
                        : 'border-gray-100',
                      childDragIndex === ci ? 'opacity-40' : '',
                      !child.enabled ? 'opacity-50' : '',
                    ]"
                    @dragstart="onChildDragStart(ci, $event)"
                    @dragover="onChildDragOver(ci, $event)"
                    @drop="onChildDrop(ci)"
                    @dragend="onChildDragEnd"
                  >
                    <div
                      class="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-400 shrink-0"
                    >
                      <svg
                        class="w-3.5 h-3.5"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
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
                      :class="child.enabled ? 'bg-green-500' : 'bg-gray-200'"
                      @click="toggleChildEnabled(child.id)"
                    >
                      <span
                        class="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
                        :class="
                          child.enabled ? 'translate-x-4' : 'translate-x-0.5'
                        "
                      />
                    </button>
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-medium text-gray-800 truncate">
                        {{ child.name }}
                      </p>
                      <p class="text-xs text-gray-400 truncate">
                        {{ child.url }}
                      </p>
                    </div>
                    <span
                      class="text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-600 shrink-0"
                      >{{ child.adapter || "inherited" }}</span
                    >
                    <div class="flex gap-1 shrink-0">
                      <button
                        class="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors"
                        @click="openEditChild(child)"
                      >
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
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                      </button>
                      <button
                        class="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        @click="removeChild(child.id)"
                      >
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
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Footer -->
            <div
              class="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0"
            >
              <button
                class="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                @click="emit('close')"
              >
                Cancel
              </button>
              <button
                class="px-4 py-2 text-sm font-medium bg-accent text-white rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
                :disabled="!form.name.trim()"
                @click="submit"
              >
                {{ editing ? "Save" : "Create" }}
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>

    <!-- Large ServiceForm reused for sub-services -->
    <ServiceForm
      :open="childFormOpen"
      :editing="editingChildAsService"
      :siblings="
        form.children.map((c) => ({
          id: c.id,
          name: c.name,
          adapter: c.adapter,
        }))
      "
      @close="
        childFormOpen = false;
        editingChildId = null;
      "
      @save="onChildSave"
      @save-and-close="onChildSaveAndClose"
      :in-composite="true"
      :inherited-adapter="
        form.defaultAdapter !== 'auto' ? form.defaultAdapter : undefined
      "
      :inherited-mapping="
        form.defaultMappingEnabled && form.defaultMapping.statusPath
          ? form.defaultMapping
          : undefined
      "
      @select-sibling="
        openEditChild(form.children.find((c) => c.id === $event.id)!)
      "
      @set-as-default="
        form.defaultAdapter = $event.adapter;
        form.defaultMapping = $event.mapping;
        form.defaultMappingEnabled = true;
        childFormOpen = false;
      "
    />
  </Teleport>
</template>
