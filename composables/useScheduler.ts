/**
 * Scheduler partagé — un seul setInterval global (5s de résolution).
 * Remplace N setInterval indépendants.
 */

interface ScheduledTask {
  intervalMs: number
  nextDue: number
  fn: () => void
}

const tasks = new Map<string, ScheduledTask>()
let masterTimer: ReturnType<typeof setInterval> | null = null
const TICK_MS = 5_000

function tick() {
  const now = Date.now()
  for (const [, task] of tasks) {
    if (now >= task.nextDue) {
      task.nextDue = now + task.intervalMs
      try { task.fn() } catch { /* silent — chaque task gère ses erreurs */ }
    }
  }
}

function startMaster() {
  if (masterTimer !== null) return
  masterTimer = setInterval(tick, TICK_MS)
}

function stopMaster() {
  if (masterTimer === null) return
  clearInterval(masterTimer)
  masterTimer = null
}

export function useScheduler() {
  function schedule(id: string, intervalMs: number, fn: () => void) {
    // Exécute immédiatement + programme le prochain
    try { fn() } catch { /* silent */ }
    tasks.set(id, { intervalMs, nextDue: Date.now() + intervalMs, fn })
    startMaster()
  }

  function unschedule(id: string) {
    tasks.delete(id)
    if (tasks.size === 0) stopMaster()
  }

  function unschedulePrefix(prefix: string) {
    for (const key of [...tasks.keys()]) {
      if (key.startsWith(prefix)) tasks.delete(key)
    }
    if (tasks.size === 0) stopMaster()
  }

  function reschedule(id: string, intervalMs: number, fn: () => void) {
    unschedule(id)
    schedule(id, intervalMs, fn)
  }

  return { schedule, unschedule, unschedulePrefix, reschedule }
}
