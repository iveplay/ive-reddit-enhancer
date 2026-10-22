import { useEffect, useRef, type RefObject } from 'react'
import { swipe } from '@/features/viewer/controller'

// Finger gestures in the viewer. Only touch pointers are handled here; mouse,
// wheel and keys work as before.
//
//   swipe up / down       next / previous post
//   swipe left / right    through a gallery, then on to the neighbouring post
//   tap                   show / hide the controls
//   double-tap, pinch     zoom an image; drag to look around while zoomed
//
// The media follows the finger while it moves: the stage's media elements get
// a transform, so the controls laid over them stay put. Swipes inside a
// Redgifs frame never reach the page; the frame helper reports those.

const SWIPE_PX = 60 // a swipe this long moves on...
const FLICK_PX = 30 // ...or a shorter one, if quick
const FLICK_MS = 300
const TAP_PX = 10 // a finger that moves less than this is tapping
const DOUBLE_TAP_MS = 280
const DOUBLE_TAP_ZOOM = 2.5
const MAX_ZOOM = 5
const MEDIA = 'img:not([hidden]), canvas, video, iframe'

let lastPointerType = ''
/** The last press was a finger; the click that follows a tap means "tap", not "click" */
export const wasTouch = () => lastPointerType === 'touch'

interface Zoom {
  s: number
  x: number
  y: number
}
const NO_ZOOM: Zoom = { s: 1, x: 0, y: 0 }

export function useGestures({
  enabled,
  overlay,
  stage,
  zoomable,
  resetKey,
  onTap,
}: {
  /** The overlay is on screen (its ref is set) */
  enabled: boolean
  overlay: RefObject<HTMLElement | null>
  /** Holds the media; its center is the media's center */
  stage: RefObject<HTMLElement | null>
  zoomable: boolean
  /** Zoom goes back to 1× when this changes (another post or image) */
  resetKey: string
  onTap: () => void
}) {
  const zoom = useRef(NO_ZOOM)
  const latest = useRef({ zoomable, onTap })
  latest.current = { zoomable, onTap }

  const render = (x: number, y: number, s: number, animate = false) => {
    stage.current?.querySelectorAll<HTMLElement>(`:scope > :is(${MEDIA})`).forEach((el) => {
      el.style.transition = animate ? 'transform 0.25s ease' : 'none'
      el.style.transform = x || y || s !== 1 ? `translate3d(${x}px, ${y}px, 0) scale(${s})` : ''
    })
  }

  useEffect(() => {
    zoom.current = NO_ZOOM
    render(0, 0, 1)
  }, [resetKey])

  useEffect(() => {
    const root = overlay.current
    if (!root) return
    const pointers = new Map<number, { x: number; y: number }>()
    let mode: 'swipe' | 'pan' | 'pinch' | null = null
    let start = { x: 0, y: 0, at: 0 }
    let base = NO_ZOOM // zoom when the pan started
    let axis: 'x' | 'y' | null = null
    let pinch = { dist: 0, x: 0, y: 0, zoom: NO_ZOOM }
    let lastTap = { at: 0, x: 0, y: 0 }
    let tapTimer: ReturnType<typeof setTimeout> | undefined

    const show = (z: Zoom, animate = false) => {
      zoom.current = z
      render(z.x, z.y, z.s, animate)
    }

    // Scale to `s` around a point on screen, which stays where it is
    const zoomAround = (z: Zoom, s: number, fx: number, fy: number): Zoom => {
      const box = stage.current!.getBoundingClientRect()
      const cx = box.left + box.width / 2
      const cy = box.top + box.height / 2
      return {
        s,
        x: fx - cx - (s / z.s) * (fx - cx - z.x),
        y: fy - cy - (s / z.s) * (fy - cy - z.y),
      }
    }

    // Zoomed media can't be dragged further than its own edges
    const clampPan = (z: Zoom): Zoom => {
      const media = stage.current?.querySelector<HTMLElement>(MEDIA)
      const box = stage.current?.getBoundingClientRect()
      if (!media || !box || z.s <= 1) return NO_ZOOM
      const maxX = Math.max(0, (media.offsetWidth * z.s - box.width) / 2)
      const maxY = Math.max(0, (media.offsetHeight * z.s - box.height) / 2)
      const clamp = (v: number, max: number) => Math.min(max, Math.max(-max, v))
      return { s: z.s, x: clamp(z.x, maxX), y: clamp(z.y, maxY) }
    }

    const settle = () => show(zoom.current.s < 1.02 ? NO_ZOOM : clampPan(zoom.current), true)

    const begin = (x: number, y: number, as: 'swipe' | 'pan') => {
      mode = as
      start = { x, y, at: Date.now() }
      base = zoom.current
      axis = null
    }

    function tap(x: number, y: number) {
      const now = Date.now()
      const { zoomable, onTap } = latest.current
      if (
        zoomable &&
        now - lastTap.at < DOUBLE_TAP_MS &&
        Math.hypot(x - lastTap.x, y - lastTap.y) < 40
      ) {
        clearTimeout(tapTimer)
        lastTap.at = 0
        show(
          zoom.current.s > 1 ? NO_ZOOM : clampPan(zoomAround(zoom.current, DOUBLE_TAP_ZOOM, x, y)),
          true,
        )
        return
      }
      lastTap = { at: now, x, y }
      clearTimeout(tapTimer)
      // Where a second tap would zoom, wait to see whether one follows
      if (zoomable) tapTimer = setTimeout(() => latest.current.onTap(), DOUBLE_TAP_MS)
      else onTap()
    }

    // Presses on the controls, and on a video's own control bar, aren't gestures
    const isControl = (event: PointerEvent) => {
      const target = event.target as Element
      if (target.closest('a, button, input, [data-no-gestures]')) return true
      if (!(target instanceof HTMLVideoElement)) return false
      return event.clientY > target.getBoundingClientRect().bottom - 64
    }

    const onDown = (event: PointerEvent) => {
      lastPointerType = event.pointerType
      if (event.pointerType !== 'touch' || isControl(event)) return
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (pointers.size === 1) {
        begin(event.clientX, event.clientY, zoom.current.s > 1 ? 'pan' : 'swipe')
      } else if (pointers.size === 2 && latest.current.zoomable) {
        const [a, b] = [...pointers.values()] as [
          { x: number; y: number },
          { x: number; y: number },
        ]
        clearTimeout(tapTimer)
        mode = 'pinch'
        pinch = {
          dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2,
          zoom: zoom.current,
        }
        show(zoom.current) // drop any swipe offset
      }
    }

    const onMove = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      const dx = event.clientX - start.x
      const dy = event.clientY - start.y

      if (mode === 'pinch') {
        if (pointers.size < 2) return
        const [a, b] = [...pointers.values()] as [
          { x: number; y: number },
          { x: number; y: number },
        ]
        const s = Math.min(
          MAX_ZOOM,
          Math.max(1, (pinch.zoom.s * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.dist),
        )
        const z = zoomAround(pinch.zoom, s, pinch.x, pinch.y)
        // ...and the fingers carry it along as they move together
        show({ s, x: z.x + (a.x + b.x) / 2 - pinch.x, y: z.y + (a.y + b.y) / 2 - pinch.y })
      } else if (mode === 'pan') {
        show({ s: base.s, x: base.x + dx, y: base.y + dy })
      } else if (mode === 'swipe') {
        if (!axis && Math.hypot(dx, dy) > TAP_PX) axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
        if (axis) render(axis === 'x' ? dx : 0, axis === 'y' ? dy : 0, 1)
      }
    }

    const onUp = (event: PointerEvent) => {
      if (!pointers.delete(event.pointerId)) return
      const cancelled = event.type === 'pointercancel'

      if (mode === 'pinch') {
        // One finger left on the screen: it drags the zoomed image from here
        const rest = [...pointers.values()][0]
        if (rest) begin(rest.x, rest.y, 'pan')
        else settle()
        return
      }
      if (pointers.size) return

      const dx = event.clientX - start.x
      const dy = event.clientY - start.y
      const elapsed = Date.now() - start.at
      const still = Math.hypot(dx, dy) < TAP_PX && elapsed < 500

      if (mode === 'pan') {
        if (still && !cancelled) tap(event.clientX, event.clientY)
        settle()
      } else if (mode === 'swipe') {
        const delta = axis === 'x' ? dx : dy
        const far =
          Math.abs(delta) >= SWIPE_PX || (elapsed < FLICK_MS && Math.abs(delta) >= FLICK_PX)
        if (!axis) {
          if (still && !cancelled) tap(event.clientX, event.clientY)
        } else if (far && !cancelled) {
          render(0, 0, 1) // the next post fades in where this one was
          swipe(axis, delta < 0 ? 1 : -1)
        } else {
          render(0, 0, 1, true) // not far enough: spring back
        }
      }
      mode = null
    }

    root.addEventListener('pointerdown', onDown)
    root.addEventListener('pointermove', onMove)
    root.addEventListener('pointerup', onUp)
    root.addEventListener('pointercancel', onUp)
    return () => {
      clearTimeout(tapTimer)
      root.removeEventListener('pointerdown', onDown)
      root.removeEventListener('pointermove', onMove)
      root.removeEventListener('pointerup', onUp)
      root.removeEventListener('pointercancel', onUp)
    }
  }, [enabled])
}
