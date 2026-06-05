<!--
  Navigation rapide entre les sous-services d'un composite.
  Apparaît dans ServiceForm quand on édite un enfant de composite
  — permet de passer d'un sous-service à l'autre sans fermer la modale.
-->
<script setup lang="ts">
interface SiblingEntry { id: string; name: string; adapter: string }

const props = defineProps<{
  siblings: SiblingEntry[]
  currentId?: string
}>()

const emit = defineEmits<{
  (e: 'select', sibling: SiblingEntry): void
}>()
</script>

<template>
  <div class="lg:w-44 shrink-0 border-b lg:border-b-0 lg:border-r border-gray-100 overflow-y-auto py-2">
    <p class="px-4 pb-2 text-xs font-medium text-gray-400 uppercase tracking-wider">Sous-services</p>
    <button
      v-for="sib in siblings"
      :key="sib.id"
      class="w-full text-left px-4 py-2 flex items-center gap-2 transition-colors text-sm"
      :class="currentId === sib.id
        ? 'bg-gray-100 font-medium text-gray-900'
        : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'"
      @click="emit('select', sib)"
    >
      <span class="truncate">{{ sib.name }}</span>
    </button>
  </div>
</template>
