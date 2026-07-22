import { useSyncExternalStore } from 'react'

// Server snapshot is false so SSR HTML always matches the motion path: the
// intro overlay renders its 'idle' phase and the active how-tab fill keeps
// xp-howfill-run. Reduced-motion clients re-render right after hydration,
// and the landing.css reduced-motion media queries cover the pre-hydration
// frame.

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION_QUERY)
  query.addEventListener('change', onChange)
  return () => {
    query.removeEventListener('change', onChange)
  }
}

const getSnapshot = () => window.matchMedia(REDUCED_MOTION_QUERY).matches

const getServerSnapshot = () => false

export function useReducedMotion() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
