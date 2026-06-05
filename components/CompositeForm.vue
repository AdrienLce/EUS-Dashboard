<script setup lang="ts">
import type {
  CompositeServiceConfig,
  SubServiceConfig,
  ServiceConfig,
} from "~/types";

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

const form = reactive({
  name: "",
  group: "",
  pollInterval: 60,
  enabled: true,
  children: [] as SubServiceConfig[],
});

// ServiceForm réutilisé pour add/edit child
const childFormOpen = ref(false);
const editingChildId = ref<string | null>(null);
// ServiceConfig bidouillé pour ServiceForm (sans group/pollInterval nécessaires)
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
    } else {
      form.name = "";
      form.group = "";
      form.pollInterval = 60;
      form.enabled = true;
      form.children = [];
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
  // Construire un ServiceConfig temporaire pour pré-remplir ServiceForm
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

function onChildSave(config: Omit<ServiceConfig, "id" | "createdAt">) {
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
  }

  childFormOpen.value = false;
}

function removeChild(id: string) {
  form.children = form.children.filter((c) => c.id !== id)
}

function toggleChildEnabled(id: string) {
  const c = form.children.find((c) => c.id === id)
  if (c) c.enabled = !c.enabled
}

// ── DnD sous-services ────────────────────────────────────────
const childDragIndex = ref<number | null>(null)
const childDragOver = ref<number | null>(null)

function onChildDragStart(i: number, e: DragEvent) {
  childDragIndex.value = i
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}
function onChildDragOver(i: number, e: DragEvent) {
  e.preventDefault()
  childDragOver.value = i
}
function onChildDrop(i: number) {
  if (childDragIndex.value === null || childDragIndex.value === i) { childDragIndex.value = null; childDragOver.value = null; return }
  const list = [...form.children]
  const [moved] = list.splice(childDragIndex.value, 1)
  list.splice(i, 0, moved)
  form.children = list
  childDragIndex.value = null
  childDragOver.value = null
}
function onChildDragEnd() { childDragIndex.value = null; childDragOver.value = null }

function submit() {
  if (!form.name.trim()) return;
  emit("save", {
    name: form.name.trim(),
    group: form.group || undefined,
    pollInterval: Math.min(Math.max(form.pollInterval, 10), 120),
    enabled: form.enabled,
    children: form.children,
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
            class="relative w-full max-w-2xl max-h-[90vh] bg-white rounded-2xl shadow-xl flex flex-col"
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
                  {{ editing ? "Modifier" : "Nouveau" }} groupe de service
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

            <div class="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              <!-- Infos composite -->
              <div class="grid grid-cols-2 gap-4">
                <div class="col-span-2">
                  <label class="block text-sm font-medium text-gray-700 mb-1"
                    >Nom <span class="text-red-500">*</span></label
                  >
                  <input
                    v-model="form.name"
                    type="text"
                    placeholder="ex: ICE"
                    class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1"
                    >Section</label
                  >
                  <input
                    v-model="form.group"
                    type="text"
                    placeholder="ex: Trading"
                    class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1"
                    >Intervalle (s)</label
                  >
                  <input
                    v-model.number="form.pollInterval"
                    type="number"
                    min="10"
                    max="120"
                    class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <!-- Sous-services -->
              <div>
                <div class="flex items-center justify-between mb-3">
                  <h3 class="text-sm font-medium text-gray-700">
                    Sous-services
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
                    Ajouter
                  </button>
                </div>

                <div
                  v-if="form.children.length === 0"
                  class="text-center py-8 rounded-xl border border-dashed border-gray-200 text-gray-400 text-sm"
                >
                  Aucun sous-service — ajoutez des flux RSS ou endpoints
                </div>

                <div v-else class="space-y-2">
                  <div
                    v-for="(child, ci) in form.children"
                    :key="child.id"
                    draggable="true"
                    class="flex items-center gap-3 p-3 rounded-lg border bg-gray-50 transition-all select-none"
                    :class="[
                      childDragOver === ci && childDragIndex !== ci ? 'border-blue-400 scale-[1.01]' : 'border-gray-100',
                      childDragIndex === ci ? 'opacity-40' : '',
                      !child.enabled ? 'opacity-50' : '',
                    ]"
                    @dragstart="onChildDragStart(ci, $event)"
                    @dragover="onChildDragOver(ci, $event)"
                    @drop="onChildDrop(ci)"
                    @dragend="onChildDragEnd"
                  >
                    <!-- Drag handle -->
                    <div class="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-400 shrink-0">
                      <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>
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
                      >{{ child.adapter }}</span
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

            <div
              class="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0"
            >
              <button
                class="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                @click="emit('close')"
              >
                Annuler
              </button>
              <button
                class="px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
                :disabled="!form.name.trim()"
                @click="submit"
              >
                {{ editing ? "Enregistrer" : "Créer" }}
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>

    <!-- Grande ServiceForm réutilisée pour les sous-services -->
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
      @close="childFormOpen = false"
      @save="onChildSave"
      @select-sibling="
        openEditChild(form.children.find((c) => c.id === $event.id)!)
      "
    />
  </Teleport>
</template>
