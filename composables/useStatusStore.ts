/**
 * @module composables/useStatusStore
 *
 * In-memory store of status snapshots with history persisted in localStorage.
 *
 * ## Data structure
 *
 * - `currentStatus`: latest known snapshot per serviceId (updated on each poll)
 * - `history`      : array of the last 50 snapshots per serviceId (reverse-chronological order)
 *
 * ## History optimization
 *
 * A new snapshot is only added to the history if the level OR the message
 * has changed compared to the last record. This avoids storing
 * dozens of identical "all is well" entries and keeps the history meaningful.
 *
 * ## Persistence
 *
 * The history is saved to localStorage on every change.
 * It is loaded on first access from a client component.
 * The current status (currentStatus) is NOT persisted — it is rebuilt
 * on each startup by the first polling cycle.
 *
 * ## Module-level state (singleton)
 *
 * `currentStatus` and `history` are shared across all instances.
 */

import { ref } from 'vue'
import type { StatusSnapshot } from '~/types'

/** localStorage key for the snapshot history */
const STORAGE_KEY = 'status-dashboard-history'

/** Maximum number of snapshots kept per service in the history */
const MAX_HISTORY_PER_SERVICE = 50

/** Record serviceId → latest known snapshot (updated on each poll) */
const currentStatus = ref<Record<string, StatusSnapshot>>({})

/** Record serviceId → snapshot history (reverse-chronological order, max 50) */
const history = ref<Record<string, StatusSnapshot[]>>({})

/**
 * Loads the history from localStorage.
 * Silent on parsing error (the history is reset to empty).
 */
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

/**
 * Saves the entire history to localStorage.
 * Called automatically on every change to the history.
 */
function saveHistory() {
  if (!import.meta.client) return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history.value))
}

/**
 * Computes a stable signature of all the incidents in a snapshot.
 *
 * It is based on the identifier and level of each incident (sorted), not
 * on their text content: this way the appearance, disappearance, or change
 * in severity of an incident produces a new history entry, but repeated
 * text updates (incident_updates) do not spam the history.
 *
 * @param snapshot - Snapshot to sign
 * @returns Signature of the incidents (empty string if no incident)
 */
function incidentSignature(snapshot: StatusSnapshot): string {
  return (snapshot.incidents ?? [])
    .map((i) => `${i.id}:${i.level}`)
    .sort()
    .join('|')
}

/**
 * Records a new snapshot in the store.
 *
 * - Always updates `currentStatus[serviceId]` (real-time status)
 * - Adds to `history` ONLY if the level, the message, OR the set of incidents has changed
 * - Caps the history at MAX_HISTORY_PER_SERVICE entries (the most recent)
 * - Persists the history to localStorage if a change is recorded
 *
 * @param snapshot - Snapshot produced by usePolling after adaptation
 */
function pushSnapshot(snapshot: StatusSnapshot) {
  // Always update the current status (for real-time display)
  currentStatus.value[snapshot.serviceId] = snapshot

  if (!history.value[snapshot.serviceId]) {
    history.value[snapshot.serviceId] = []
  }

  const arr = history.value[snapshot.serviceId]

  // Only add to the history if the level, the message, or the incidents have changed.
  // Taking incidents into account is necessary because an incident can appear
  // (e.g. Statuspage) without changing the global indicator or the description.
  const last = arr[0]
  const changed =
    !last ||
    last.level !== snapshot.level ||
    last.message !== snapshot.message ||
    incidentSignature(last) !== incidentSignature(snapshot)

  if (changed) {
    // Insert at the head (reverse-chronological order)
    arr.unshift(snapshot)
    // Truncate if the limit is reached
    if (arr.length > MAX_HISTORY_PER_SERVICE) {
      arr.splice(MAX_HISTORY_PER_SERVICE)
    }
    saveHistory()
  }
}

/**
 * Returns the snapshot history for a service.
 *
 * @param serviceId - ID of the service
 * @returns Array of snapshots (reverse-chronological order), empty if no history
 */
function getHistory(serviceId: string): StatusSnapshot[] {
  return history.value[serviceId] ?? []
}

/**
 * Removes the history of a service and persists the deletion.
 *
 * @param serviceId - ID of the service whose history to clear
 */
function clearHistory(serviceId: string) {
  delete history.value[serviceId]
  saveHistory()
}

/**
 * Composable exposing the status store for reading/writing.
 *
 * @example
 * const { currentStatus, pushSnapshot, getHistory } = useStatusStore()
 *
 * // Read the current status of a service
 * const snap = currentStatus.value['my-service-id']
 *
 * // Read the history
 * const hist = getHistory('my-service-id')
 */
export function useStatusStore() {
  // Load the history on first client-side access
  if (import.meta.client && Object.keys(history.value).length === 0) {
    loadHistory()
  }

  return {
    /** Reactive record serviceId → latest StatusSnapshot */
    currentStatus,
    getHistory,
    pushSnapshot,
    clearHistory,
  }
}
