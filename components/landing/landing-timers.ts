// Shared restart bus mirroring the prototype's _startTimers(): a click on
// EITHER auto-advancing widget (how tabs / why accordion) restarts BOTH
// intervals. Each widget registers its own restart fn on mount.

const restarts = new Set<() => void>()

export function registerRestart(fn: () => void) {
  restarts.add(fn)
  return () => {
    restarts.delete(fn)
  }
}

export function restartAllTimers() {
  restarts.forEach((fn) => fn())
}
