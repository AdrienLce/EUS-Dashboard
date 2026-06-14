/**
 * @module composables/useScheduler
 *
 * Centralized single-timer scheduler for polling services.
 *
 * ## Architecture: a single global setInterval
 *
 * Instead of creating a separate `setInterval` for each monitored service
 * (which would create N parallel timers with N services), this module maintains
 * a single "master" `setInterval` that runs every 5 seconds (TICK_MS).
 *
 * On each tick, it iterates over a Map of scheduled tasks and runs those
 * whose `nextDue` has passed. This makes it possible to:
 * - Minimize the number of active system timers (always 1 at most)
 * - Add/remove tasks dynamically without creating/destroying timers
 * - Cleanly stop the global timer when no tasks remain active
 *
 * ## Time resolution
 *
 * The resolution is 5 seconds (TICK_MS). A service configured at 30s will
 * run with ±5s accuracy. This is acceptable for status monitoring.
 *
 * ## Immediate execution
 *
 * The `schedule` function runs the task immediately (first synchronous call)
 * then schedules the next tick according to the interval. This avoids waiting
 * a full interval before the first data is displayed.
 *
 * ## Shared state (module-level)
 *
 * The `tasks` and `masterTimer` variables are declared at the module level
 * (outside the composable), which means they are shared across all instances
 * of useScheduler. This is intentional: the scheduler is a global singleton
 * within the application.
 */

/**
 * A scheduled task in the scheduler.
 */
interface ScheduledTask {
  /** Interval in milliseconds between two executions */
  intervalMs: number
  /** Timestamp (Date.now()) of the next scheduled execution */
  nextDue: number
  /** Function to execute (must handle its own errors) */
  fn: () => void
}

/** Map id → task. Shared across all instances of the composable (singleton). */
const tasks = new Map<string, ScheduledTask>()

/** Reference to the global setInterval, null if no task is active */
let masterTimer: ReturnType<typeof setInterval> | null = null

/** Resolution of the global timer in milliseconds (5 seconds) */
const TICK_MS = 5_000

/**
 * Function executed on each tick of the global timer.
 * Iterates over all tasks and runs those whose deadline has passed.
 */
function tick() {
  const now = Date.now()
  for (const [, task] of tasks) {
    if (now >= task.nextDue) {
      // Update nextDue BEFORE execution to avoid drift
      task.nextDue = now + task.intervalMs
      try { task.fn() } catch { /* Each task handles its own errors via usePolling */ }
    }
  }
}

/**
 * Starts the global timer if it isn't already running.
 * Idempotent — can be called multiple times with no effect.
 */
function startMaster() {
  if (masterTimer !== null) return
  masterTimer = setInterval(tick, TICK_MS)
}

/**
 * Stops the global timer.
 * Called automatically when the task Map is empty.
 */
function stopMaster() {
  if (masterTimer === null) return
  clearInterval(masterTimer)
  masterTimer = null
}

/**
 * Composable exposing the centralized scheduler.
 *
 * @example
 * const { schedule, unschedule, unschedulePrefix, reschedule } = useScheduler()
 *
 * // Schedule a task every 30 seconds
 * schedule('service-abc', 30_000, () => fetchStatus('abc'))
 *
 * // Remove a task
 * unschedule('service-abc')
 *
 * // Remove all tasks of a composite (prefix)
 * unschedulePrefix('composite-xyz::')
 *
 * // Change the interval of an existing task
 * reschedule('service-abc', 60_000, () => fetchStatus('abc'))
 */
export function useScheduler() {
  /**
   * Registers a new scheduled task and runs it immediately.
   *
   * If a task with the same `id` already exists, it is replaced.
   * The global timer is started automatically if needed.
   *
   * @param id         - Unique identifier of the task (e.g. serviceId, "compositeId::childId")
   * @param intervalMs - Interval between two executions in milliseconds
   * @param fn         - Function to execute (typically fetchOne from usePolling)
   */
  function schedule(id: string, intervalMs: number, fn: () => void) {
    // Immediate execution to display data without waiting for the first interval
    try { fn() } catch { /* silent */ }
    tasks.set(id, { intervalMs, nextDue: Date.now() + intervalMs, fn })
    startMaster()
  }

  /**
   * Removes a scheduled task by its exact identifier.
   * Stops the global timer if no task remains active.
   *
   * @param id - Identifier of the task to remove
   */
  function unschedule(id: string) {
    tasks.delete(id)
    if (tasks.size === 0) stopMaster()
  }

  /**
   * Removes all tasks whose identifier starts with a given prefix.
   * Used to bulk-remove all tasks of a composite service
   * (children are registered with the key `"compositeId::childId"`).
   *
   * Passing '' as the prefix removes ALL tasks (used by stopAll).
   *
   * @param prefix - Prefix to search for (e.g. "compositeId::")
   *
   * @example
   * // Remove all children of a composite
   * unschedulePrefix('my-composite-id::')
   *
   * // Remove all tasks
   * unschedulePrefix('')
   */
  function unschedulePrefix(prefix: string) {
    for (const key of [...tasks.keys()]) {
      if (key.startsWith(prefix)) tasks.delete(key)
    }
    if (tasks.size === 0) stopMaster()
  }

  /**
   * Replaces an existing task with a new configuration.
   * Equivalent to unschedule + schedule, but without immediate execution
   * of the old task (the new one is run immediately via schedule).
   *
   * @param id         - Identifier of the task to replace
   * @param intervalMs - New interval in milliseconds
   * @param fn         - New function to execute
   */
  function reschedule(id: string, intervalMs: number, fn: () => void) {
    unschedule(id)
    schedule(id, intervalMs, fn)
  }

  return { schedule, unschedule, unschedulePrefix, reschedule }
}
