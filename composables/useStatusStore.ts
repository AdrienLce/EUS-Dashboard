import { ref } from 'vue'
import type { StatusSnapshot } from '~/types'

const STORAGE_KEY = 'status-dashboard-history'
const MAX_HISTORY_PER_SERVICE = 50

const currentStatus = ref<Record<string, StatusSnapshot>>({})
const history = ref<Record<string, StatusSnapshot[]>>({})

function loadHistory() {
  if (!import.meta.client) return
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    history.value = raw ? JSON.parse(raw) : {}
  }
  catch {
    history.value = {}
  }
}

function saveHistory() {
  if (!import.meta.client) return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history.value))
}

function pushSnapshot(snapshot: StatusSnapshot) {
  currentStatus.value[snapshot.serviceId] = snapshot

  if (!history.value[snapshot.serviceId]) {
    history.value[snapshot.serviceId] = []
  }

  const arr = history.value[snapshot.serviceId]

  // N'ajoute que si niveau ou message a changé
  const last = arr[0]
  const changed = !last || last.level !== snapshot.level || last.message !== snapshot.message

  if (changed) {
    arr.unshift(snapshot)
    if (arr.length > MAX_HISTORY_PER_SERVICE) {
      arr.splice(MAX_HISTORY_PER_SERVICE)
    }
    saveHistory()
  }
}

function getHistory(serviceId: string): StatusSnapshot[] {
  return history.value[serviceId] ?? []
}

function clearHistory(serviceId: string) {
  delete history.value[serviceId]
  saveHistory()
}

export function useStatusStore() {
  if (import.meta.client && Object.keys(history.value).length === 0) {
    loadHistory()
  }

  return {
    currentStatus,
    getHistory,
    pushSnapshot,
    clearHistory,
  }
}
