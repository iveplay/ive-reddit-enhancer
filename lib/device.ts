import { useSyncExternalStore } from 'react'

// Screen size and input kind, for the few things that differ on phones beyond
// what CSS media queries handle on their own. Keep the widths in step with the
// media queries in the SCSS files.

/** Phone-sized window: the layouts that change shape (dock, viewer, grid columns) */
export const NARROW_QUERY = '(max-width: 640px)'
/** Fingers rather than a mouse: no hover, gestures instead of keys */
export const TOUCH_QUERY = '(hover: none) and (pointer: coarse)'

export const matches = (query: string) => window.matchMedia(query).matches

export function useMedia(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => matches(query),
  )
}
