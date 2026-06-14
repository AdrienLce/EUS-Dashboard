<script setup lang="ts">
import type { LevelConfig } from "~/types";
import { DEFAULT_LEVEL_CONFIGS } from "~/types";
import { useLevelConfig, levelStyles } from "~/composables/useLevelConfig";

defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: "close"): void }>();

const { levels, save } = useLevelConfig();

const draft = ref<LevelConfig[]>([]);

watch(
  () => levels.value,
  (v) => {
    draft.value = v.map((l) => ({ ...l }));
  },
  { immediate: true, deep: true },
);

function apply() {
  levels.value = draft.value.map((l) => ({ ...l }));
  save();
  emit("close");
}

function doReset() {
  draft.value = DEFAULT_LEVEL_CONFIGS.map((l) => ({ ...l }));
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") emit("close");
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
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div
          class="absolute inset-0 bg-black/40 backdrop-blur-sm"
          @click="emit('close')"
        />
        <div
          class="relative w-full max-w-2xl bg-white rounded-2xl shadow-xl flex flex-col"
        >
          <!-- Header -->
          <div
            class="flex items-center justify-between px-6 py-4 border-b border-gray-100"
          >
            <div>
              <h2 class="font-semibold text-gray-900">
                Customize levels
              </h2>
              <p class="text-xs text-gray-400 mt-0.5">
                The reference is fixed (the level's meaning). The label is what is
                displayed.
              </p>
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

          <!-- Column headers -->
          <div
            class="grid items-center gap-3 px-6 pt-4 pb-1 text-xs font-medium text-gray-400 uppercase tracking-wider"
            style="grid-template-columns: 40px 1fr 1fr 1fr"
          >
            <span></span>
            <span>Preview</span>
            <span>Reference</span>
            <span>Displayed label</span>
          </div>

          <!-- Rows -->
          <div class="flex-1 overflow-y-auto px-6 py-2 space-y-2">
            <div
              v-for="cfg in draft"
              :key="cfg.id"
              class="grid items-center gap-3"
              style="grid-template-columns: 40px 1fr 1fr 1fr"
            >
              <!-- Color picker -->
              <input
                v-model="cfg.color"
                type="color"
                class="w-9 h-9 rounded-lg cursor-pointer border border-gray-200 p-0.5 bg-white"
              />

              <!-- Badge preview -->
              <span
                class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-medium whitespace-nowrap"
                :style="levelStyles(cfg.color).badge"
              >
                <span
                  class="w-2 h-2 rounded-full shrink-0"
                  :style="levelStyles(cfg.color).dot"
                />
                {{ cfg.label }}
              </span>

              <!-- Reference (locked) -->
              <span
                class="text-xs text-gray-400 italic truncate"
                :title="cfg.reference"
                >{{ cfg.reference }}</span
              >

              <!-- Label editable -->
              <input
                v-model="cfg.label"
                type="text"
                class="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
              />
            </div>
          </div>

          <!-- Footer -->
          <div
            class="px-6 py-4 border-t border-gray-100 flex items-center justify-between"
          >
            <button
              class="text-sm text-gray-400 hover:text-gray-600 transition-colors"
              @click="doReset"
            >
              Reset
            </button>
            <div class="flex gap-3">
              <button
                class="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                @click="emit('close')"
              >
                Cancel
              </button>
              <button
                class="px-4 py-2 text-sm font-medium bg-accent text-white rounded-xl hover:opacity-90 transition-opacity"
                @click="apply"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
