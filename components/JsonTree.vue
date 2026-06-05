<script setup lang="ts">
const props = defineProps<{
  data: unknown
  path?: string
  depth?: number
  highlightPaths?: string[]
}>()

const emit = defineEmits<{
  (e: 'select', payload: { path: string; value: unknown }): void
}>()

const depth = computed(() => props.depth ?? 0)
const path = computed(() => props.path ?? '')

function getType(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

function isLeaf(value: unknown): boolean {
  const t = getType(value)
  return ['string', 'number', 'boolean', 'null'].includes(t)
}

function isPrimitive(value: unknown): boolean {
  return isLeaf(value)
}

function childPath(key: string | number): string {
  if (!path.value) return String(key)
  return `${path.value}.${key}`
}

function isHighlighted(p: string): boolean {
  return (props.highlightPaths ?? []).some((h) => h === p || h.startsWith(p + '.'))
}

function valueClass(value: unknown): string {
  const t = getType(value)
  if (t === 'string') return 'text-green-700'
  if (t === 'number') return 'text-blue-700'
  if (t === 'boolean') return 'text-purple-700'
  if (t === 'null') return 'text-gray-400'
  return 'text-gray-600'
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return `"${value}"`
  if (value === null) return 'null'
  return String(value)
}

// Expand state
const expanded = ref<Record<string, boolean>>({})

function toggle(key: string) {
  expanded.value[key] = !expanded.value[key]
}

function isExpanded(key: string): boolean {
  // Auto-expand first 2 levels
  return expanded.value[key] ?? depth.value < 2
}

function handleLeafClick(key: string | number, value: unknown) {
  const p = childPath(key)
  emit('select', { path: p, value })
}

function forwardSelect(payload: { path: string; value: unknown }) {
  emit('select', payload)
}

const dataObj = computed(() => {
  if (typeof props.data === 'object' && props.data !== null && !Array.isArray(props.data)) {
    return props.data as Record<string, unknown>
  }
  return null
})

const dataArr = computed(() => {
  if (Array.isArray(props.data)) return props.data as unknown[]
  return null
})
</script>

<template>
  <!-- Object -->
  <div v-if="dataObj" class="font-mono text-xs">
    <div
      v-for="(value, key) in dataObj"
      :key="key"
      class="leading-relaxed"
    >
      <div
        class="flex items-start gap-1 group"
        :class="{ 'bg-blue-50 rounded': isHighlighted(childPath(key)) }"
      >
        <!-- Indent -->
        <span
          class="shrink-0 select-none text-gray-300"
          :style="{ paddingLeft: `${depth * 12}px` }"
        />

        <!-- Toggle for objects/arrays -->
        <button
          v-if="!isPrimitive(value)"
          class="w-4 h-4 shrink-0 flex items-center justify-center text-gray-400 hover:text-gray-600 mt-0.5"
          @click="toggle(String(key))"
        >
          <svg
            class="w-3 h-3 transition-transform"
            :class="isExpanded(String(key)) ? 'rotate-90' : ''"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <span v-else class="w-4 shrink-0" />

        <!-- Key -->
        <button
          v-if="isPrimitive(value)"
          class="text-gray-700 font-semibold hover:text-blue-600 hover:underline cursor-pointer transition-colors text-left"
          :title="`Cliquer pour mapper: ${childPath(key)}`"
          @click="handleLeafClick(key, value)"
        >
          {{ key }}:
        </button>
        <span v-else class="text-gray-700 font-semibold">{{ key }}:</span>

        <!-- Leaf value -->
        <span
          v-if="isPrimitive(value)"
          :class="valueClass(value)"
          class="ml-1"
        >{{ formatValue(value) }}</span>

        <!-- Collapsed preview -->
        <span
          v-else-if="!isExpanded(String(key))"
          class="text-gray-400 ml-1"
        >
          {{ Array.isArray(value) ? `[${(value as unknown[]).length}]` : '{…}' }}
        </span>
      </div>

      <!-- Recursive children -->
      <div v-if="!isPrimitive(value) && isExpanded(String(key))">
        <JsonTree
          :data="value"
          :path="childPath(key)"
          :depth="depth + 1"
          :highlight-paths="highlightPaths"
          @select="forwardSelect"
        />
      </div>
    </div>
  </div>

  <!-- Array -->
  <div v-else-if="dataArr" class="font-mono text-xs">
    <div
      v-for="(item, i) in dataArr"
      :key="i"
    >
      <div
        class="flex items-start gap-1"
        :style="{ paddingLeft: `${depth * 12}px` }"
      >
        <span class="text-gray-400 shrink-0">[{{ i }}]</span>
        <span class="text-gray-400">:</span>
      </div>
      <JsonTree
        v-if="!isPrimitive(item)"
        :data="item"
        :path="childPath(i)"
        :depth="depth + 1"
        :highlight-paths="highlightPaths"
        @select="forwardSelect"
      />
      <span
        v-else
        :class="valueClass(item)"
        :style="{ paddingLeft: `${(depth + 1) * 12}px` }"
        class="block"
      >{{ formatValue(item) }}</span>
    </div>
  </div>

  <!-- Primitive fallback -->
  <span
    v-else
    :class="valueClass(data)"
    class="font-mono text-xs"
  >{{ formatValue(data) }}</span>
</template>
