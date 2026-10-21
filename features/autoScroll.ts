import { create } from 'zustand'
import { getSettings, SCROLL_SPEEDS, updateSettings } from '@/lib/settings'
import { useViewer } from './viewer/store'

// Hands-free scrolling down the feed, at one of eight speeds. Holds still
// while the fullscreen viewer covers the page.

export const useAutoScroll = create<{ running: boolean }>()(() => ({ running: false }))

let lastTime = 0
let carry = 0 // fraction of a pixel left over from the previous frame

function tick(now: number) {
  if (!useAutoScroll.getState().running) return
  const elapsed = Math.min(now - lastTime, 100) // don't leap after a stall
  lastTime = now
  if (!useViewer.getState().open) {
    carry += (SCROLL_SPEEDS[getSettings().autoScroll.level]! * elapsed) / 1000
    const whole = Math.floor(carry)
    if (whole > 0) {
      carry -= whole
      window.scrollBy({ top: whole, behavior: 'instant' })
    }
  }
  requestAnimationFrame(tick)
}

export function setAutoScroll(running: boolean) {
  if (useAutoScroll.getState().running === running) return
  useAutoScroll.setState({ running })
  if (!running) return
  lastTime = performance.now()
  carry = 0
  requestAnimationFrame(tick)
}

export const toggleAutoScroll = () => setAutoScroll(!useAutoScroll.getState().running)

/** dir +1 = faster, -1 = slower */
export const changeScrollSpeed = (dir: number) =>
  updateSettings({ autoScroll: { level: getSettings().autoScroll.level + dir } })
