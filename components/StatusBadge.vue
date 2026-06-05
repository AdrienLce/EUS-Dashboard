<script setup lang="ts">
import type { StatusLevel } from '~/types'
import { useLevelConfig, levelStyles } from '~/composables/useLevelConfig'

const props = defineProps<{
  level: StatusLevel
  size?: 'sm' | 'md'
}>()

const { getConfig } = useLevelConfig()
const size = computed(() => props.size ?? 'md')

const config = computed(() => getConfig(props.level))
const styles = computed(() => levelStyles(config.value.color))
const isActive = computed(() => props.level !== 'operational' && props.level !== 'inconnu')
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-full font-medium border"
    :class="size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'"
    :style="styles.badge"
  >
    <span
      class="rounded-full shrink-0"
      :class="[
        size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2',
        isActive ? 'animate-pulse' : '',
      ]"
      :style="styles.dot"
    />
    {{ config.label }}
  </span>
</template>
