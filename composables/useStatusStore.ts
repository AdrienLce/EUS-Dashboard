/**
 * @module composables/useStatusStore
 *
 * Store en mémoire des snapshots de statut avec historique persisté dans localStorage.
 *
 * ## Structure des données
 *
 * - `currentStatus` : dernier snapshot connu par serviceId (mise à jour à chaque poll)
 * - `history`       : tableau des 50 derniers snapshots par serviceId (ordre antéchronologique)
 *
 * ## Optimisation de l'historique
 *
 * Un nouveau snapshot n'est ajouté à l'historique que si le niveau OU le message
 * a changé par rapport au dernier enregistrement. Cela évite de stocker des
 * dizaines d'entrées identiques "tout va bien" et rend l'historique significatif.
 *
 * ## Persistance
 *
 * L'historique est sauvegardé dans localStorage à chaque changement.
 * Il est chargé au premier accès depuis un composant client.
 * Le statut courant (currentStatus) n'est PAS persisté — il est reconstruit
 * à chaque démarrage par le premier cycle de polling.
 *
 * ## État module-level (singleton)
 *
 * `currentStatus` et `history` sont partagés entre toutes les instances.
 */

import { ref } from 'vue'
import type { StatusSnapshot } from '~/types'

/** Clé localStorage pour l'historique des snapshots */
const STORAGE_KEY = 'status-dashboard-history'

/** Nombre maximum de snapshots conservés par service dans l'historique */
const MAX_HISTORY_PER_SERVICE = 50

/** Record serviceId → dernier snapshot connu (mis à jour à chaque poll) */
const currentStatus = ref<Record<string, StatusSnapshot>>({})

/** Record serviceId → historique des snapshots (ordre antéchronologique, max 50) */
const history = ref<Record<string, StatusSnapshot[]>>({})

/**
 * Charge l'historique depuis localStorage.
 * Silencieux en cas d'erreur de parsing (l'historique est réinitialisé à vide).
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
 * Sauvegarde l'historique complet dans localStorage.
 * Appelée automatiquement à chaque changement dans l'historique.
 */
function saveHistory() {
  if (!import.meta.client) return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history.value))
}

/**
 * Calcule une signature stable de l'ensemble des incidents d'un snapshot.
 *
 * On se base sur l'identifiant et le niveau de chaque incident (triés), et non
 * sur leur contenu textuel : ainsi l'apparition, la disparition ou le changement
 * de sévérité d'un incident produit une nouvelle entrée d'historique, mais les
 * mises à jour de texte répétées (incident_updates) ne spamment pas l'historique.
 *
 * @param snapshot - Snapshot à signer
 * @returns Signature des incidents (chaîne vide si aucun incident)
 */
function incidentSignature(snapshot: StatusSnapshot): string {
  return (snapshot.incidents ?? [])
    .map((i) => `${i.id}:${i.level}`)
    .sort()
    .join('|')
}

/**
 * Enregistre un nouveau snapshot dans le store.
 *
 * - Met toujours à jour `currentStatus[serviceId]` (statut en temps réel)
 * - N'ajoute à `history` QUE si le niveau, le message OU l'ensemble des incidents a changé
 * - Limite l'historique à MAX_HISTORY_PER_SERVICE entrées (les plus récentes)
 * - Persiste l'historique dans localStorage si un changement est enregistré
 *
 * @param snapshot - Snapshot produit par usePolling après adaptation
 */
function pushSnapshot(snapshot: StatusSnapshot) {
  // Toujours mettre à jour le statut courant (pour l'affichage temps réel)
  currentStatus.value[snapshot.serviceId] = snapshot

  if (!history.value[snapshot.serviceId]) {
    history.value[snapshot.serviceId] = []
  }

  const arr = history.value[snapshot.serviceId]

  // N'ajouter à l'historique que si le niveau, le message ou les incidents ont changé.
  // La prise en compte des incidents est nécessaire car un incident peut apparaître
  // (ex: Statuspage) sans modifier l'indicateur global ni la description.
  const last = arr[0]
  const changed =
    !last ||
    last.level !== snapshot.level ||
    last.message !== snapshot.message ||
    incidentSignature(last) !== incidentSignature(snapshot)

  if (changed) {
    // Insérer en tête (ordre antéchronologique)
    arr.unshift(snapshot)
    // Tronquer si la limite est atteinte
    if (arr.length > MAX_HISTORY_PER_SERVICE) {
      arr.splice(MAX_HISTORY_PER_SERVICE)
    }
    saveHistory()
  }
}

/**
 * Retourne l'historique des snapshots pour un service.
 *
 * @param serviceId - ID du service
 * @returns Tableau de snapshots (ordre antéchronologique), vide si aucun historique
 */
function getHistory(serviceId: string): StatusSnapshot[] {
  return history.value[serviceId] ?? []
}

/**
 * Supprime l'historique d'un service et persiste la suppression.
 *
 * @param serviceId - ID du service dont effacer l'historique
 */
function clearHistory(serviceId: string) {
  delete history.value[serviceId]
  saveHistory()
}

/**
 * Composable exposant le store de statut en lecture/écriture.
 *
 * @example
 * const { currentStatus, pushSnapshot, getHistory } = useStatusStore()
 *
 * // Lire le statut actuel d'un service
 * const snap = currentStatus.value['my-service-id']
 *
 * // Lire l'historique
 * const hist = getHistory('my-service-id')
 */
export function useStatusStore() {
  // Charger l'historique au premier accès côté client
  if (import.meta.client && Object.keys(history.value).length === 0) {
    loadHistory()
  }

  return {
    /** Record réactif serviceId → dernier StatusSnapshot */
    currentStatus,
    getHistory,
    pushSnapshot,
    clearHistory,
  }
}
