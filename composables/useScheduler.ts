/**
 * @module composables/useScheduler
 *
 * Scheduler centralisé à timer unique pour le polling des services.
 *
 * ## Architecture : un seul setInterval global
 *
 * Au lieu de créer un `setInterval` distinct pour chaque service surveillé
 * (ce qui créerait N timers en parallèle avec N services), ce module maintient
 * un seul `setInterval` "maître" qui tourne toutes les 5 secondes (TICK_MS).
 *
 * À chaque tick, il parcourt une Map de tâches planifiées et exécute celles
 * dont le `nextDue` est dépassé. Cela permet de :
 * - Minimiser le nombre de timers système actifs (toujours 1 max)
 * - Ajouter/supprimer des tâches dynamiquement sans créer/détruire des timers
 * - Arrêter proprement le timer global quand plus aucune tâche n'est active
 *
 * ## Résolution temporelle
 *
 * La résolution est de 5 secondes (TICK_MS). Un service configuré à 30s sera
 * exécuté à ±5s près. C'est acceptable pour du monitoring de statut.
 *
 * ## Exécution immédiate
 *
 * La fonction `schedule` exécute la tâche immédiatement (premier appel synchrone)
 * puis programme le prochain tick selon l'intervalle. Cela évite d'attendre
 * un intervalle complet avant la première donnée affichée.
 *
 * ## État partagé (module-level)
 *
 * Les variables `tasks` et `masterTimer` sont déclarées au niveau module
 * (en dehors du composable), ce qui signifie qu'elles sont partagées entre
 * toutes les instances de useScheduler. C'est intentionnel : le scheduler
 * est un singleton global dans l'application.
 */

/**
 * Une tâche planifiée dans le scheduler.
 */
interface ScheduledTask {
  /** Intervalle en millisecondes entre deux exécutions */
  intervalMs: number
  /** Timestamp (Date.now()) de la prochaine exécution prévue */
  nextDue: number
  /** Fonction à exécuter (doit gérer ses propres erreurs) */
  fn: () => void
}

/** Map id → tâche. Partagée entre toutes les instances du composable (singleton). */
const tasks = new Map<string, ScheduledTask>()

/** Référence au setInterval global, null si aucune tâche n'est active */
let masterTimer: ReturnType<typeof setInterval> | null = null

/** Résolution du timer global en millisecondes (5 secondes) */
const TICK_MS = 5_000

/**
 * Fonction exécutée à chaque tick du timer global.
 * Parcourt toutes les tâches et exécute celles dont l'échéance est dépassée.
 */
function tick() {
  const now = Date.now()
  for (const [, task] of tasks) {
    if (now >= task.nextDue) {
      // Mettre à jour nextDue AVANT l'exécution pour éviter les dérives
      task.nextDue = now + task.intervalMs
      try { task.fn() } catch { /* Chaque tâche gère ses propres erreurs via usePolling */ }
    }
  }
}

/**
 * Démarre le timer global si ce n'est pas déjà fait.
 * Idempotent — peut être appelé plusieurs fois sans effet.
 */
function startMaster() {
  if (masterTimer !== null) return
  masterTimer = setInterval(tick, TICK_MS)
}

/**
 * Arrête le timer global.
 * Appelé automatiquement quand la Map de tâches est vide.
 */
function stopMaster() {
  if (masterTimer === null) return
  clearInterval(masterTimer)
  masterTimer = null
}

/**
 * Composable exposant le scheduler centralisé.
 *
 * @example
 * const { schedule, unschedule, unschedulePrefix, reschedule } = useScheduler()
 *
 * // Planifier une tâche toutes les 30 secondes
 * schedule('service-abc', 30_000, () => fetchStatus('abc'))
 *
 * // Supprimer une tâche
 * unschedule('service-abc')
 *
 * // Supprimer toutes les tâches d'un composite (préfixe)
 * unschedulePrefix('composite-xyz::')
 *
 * // Modifier l'intervalle d'une tâche existante
 * reschedule('service-abc', 60_000, () => fetchStatus('abc'))
 */
export function useScheduler() {
  /**
   * Enregistre une nouvelle tâche planifiée et l'exécute immédiatement.
   *
   * Si une tâche avec le même `id` existe déjà, elle est remplacée.
   * Le timer global est démarré automatiquement si nécessaire.
   *
   * @param id         - Identifiant unique de la tâche (ex: serviceId, "compositeId::childId")
   * @param intervalMs - Intervalle entre deux exécutions en millisecondes
   * @param fn         - Fonction à exécuter (typiquement fetchOne depuis usePolling)
   */
  function schedule(id: string, intervalMs: number, fn: () => void) {
    // Exécution immédiate pour afficher les données sans attendre le premier intervalle
    try { fn() } catch { /* silent */ }
    tasks.set(id, { intervalMs, nextDue: Date.now() + intervalMs, fn })
    startMaster()
  }

  /**
   * Supprime une tâche planifiée par son identifiant exact.
   * Arrête le timer global si plus aucune tâche n'est active.
   *
   * @param id - Identifiant de la tâche à supprimer
   */
  function unschedule(id: string) {
    tasks.delete(id)
    if (tasks.size === 0) stopMaster()
  }

  /**
   * Supprime toutes les tâches dont l'identifiant commence par un préfixe donné.
   * Utilisé pour supprimer en bloc toutes les tâches d'un service composite
   * (les enfants sont enregistrés avec la clé `"compositeId::childId"`).
   *
   * Passer '' comme préfixe supprime TOUTES les tâches (utilisé par stopAll).
   *
   * @param prefix - Préfixe à rechercher (ex: "compositeId::")
   *
   * @example
   * // Supprimer tous les enfants d'un composite
   * unschedulePrefix('my-composite-id::')
   *
   * // Supprimer toutes les tâches
   * unschedulePrefix('')
   */
  function unschedulePrefix(prefix: string) {
    for (const key of [...tasks.keys()]) {
      if (key.startsWith(prefix)) tasks.delete(key)
    }
    if (tasks.size === 0) stopMaster()
  }

  /**
   * Remplace une tâche existante par une nouvelle configuration.
   * Équivalent à unschedule + schedule, mais sans exécution immédiate
   * de l'ancienne tâche (la nouvelle est exécutée immédiatement via schedule).
   *
   * @param id         - Identifiant de la tâche à remplacer
   * @param intervalMs - Nouvel intervalle en millisecondes
   * @param fn         - Nouvelle fonction à exécuter
   */
  function reschedule(id: string, intervalMs: number, fn: () => void) {
    unschedule(id)
    schedule(id, intervalMs, fn)
  }

  return { schedule, unschedule, unschedulePrefix, reschedule }
}
