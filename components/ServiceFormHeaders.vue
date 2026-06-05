<!-- Panneau En-têtes HTTP supplémentaires — sous-composant de ServiceForm -->
<script setup lang="ts">
const headers = defineModel<{ key: string; value: string }[]>('headers', { required: true })

function add() { headers.value.push({ key: '', value: '' }) }
function remove(i: number) { headers.value.splice(i, 1) }
</script>

<template>
  <div class="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-3">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7"/></svg>
        <label class="text-sm font-medium text-gray-700">En-têtes supplémentaires</label>
      </div>
      <button class="text-xs text-blue-600 hover:text-blue-700 font-medium" @click="add">+ Ajouter</button>
    </div>
    <div v-if="headers.length > 0" class="space-y-2">
      <div v-for="(header, i) in headers" :key="i" class="flex gap-2 items-center">
        <input v-model="header.key" type="text" placeholder="Clé" class="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
        <input v-model="header.value" type="text" placeholder="Valeur" class="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
        <button class="p-2 text-gray-400 hover:text-red-500 transition-colors" @click="remove(i)">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
    </div>
    <p v-else class="text-xs text-gray-400 italic">Aucun en-tête supplémentaire</p>
  </div>
</template>
