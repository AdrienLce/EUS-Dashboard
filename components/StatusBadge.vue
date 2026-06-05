<script setup lang="ts">
import type { StatusLevel } from '~/types'
import { LEVEL_LABELS, LEVEL_COLORS } from '~/types'

const props = defineProps<{
  level: StatusLevel
  size?: 'sm' | 'md'
}>()

const size = computed(() => props.size ?? 'md')
const colors = computed(() => LEVEL_COLORS[props.level])
const label = computed(() => LEVEL_LABELS[props.level])
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-full font-medium"
    :class="[
      colors.bg,
      colors.text,
      colors.border,
      'border',
      size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
    ]"
  >
    <span
      class="rounded-full shrink-0"
      :class="[
        colors.dot,
        size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2',
        level === 'operational' || level === 'inconnu' ? '' : 'animate-pulse',
      ]"
    />
    {{ label }}
  </span>
</template>
