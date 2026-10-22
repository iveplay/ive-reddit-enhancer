import { create } from 'zustand'

export interface ViewerState {
  open: boolean
  /** Position in the registry's post order */
  index: number
  /** Image within a gallery post */
  galleryIndex: number
  slideshow: boolean
  /** The GIF on screen is frozen on its current frame */
  gifPaused: boolean
  /** Time until the next slide; key changes each time the countdown restarts */
  progress: { seconds: number; key: number }
  /** Number of posts known so far (grows as the feed loads more) */
  count: number
  /** Short message shown over the dock, e.g. when there's nothing to view */
  toast: string | null
  /** Goes up when the controls should show again (a click inside a Redgifs frame) */
  wakes: number
}

export const useViewer = create<ViewerState>()(() => ({
  open: false,
  index: 0,
  galleryIndex: 0,
  slideshow: false,
  gifPaused: false,
  progress: { seconds: 0, key: 0 },
  count: 0,
  toast: null,
  wakes: 0,
}))

let toastTimer: ReturnType<typeof setTimeout> | undefined
export function showToast(toast: string) {
  clearTimeout(toastTimer)
  useViewer.setState({ toast })
  toastTimer = setTimeout(() => useViewer.setState({ toast: null }), 2500)
}
