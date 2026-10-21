import { create } from 'zustand'
import { onDomChange } from '@/lib/dom'

/** Whether the page has a feed; the dock hides feed-only buttons without one */
export const useFeedPresent = create<boolean>()(() => false)

export const currentFeed = () => document.querySelector<HTMLElement>('shreddit-feed')

export function initFeedPresence() {
  const sync = () => {
    const present = !!currentFeed()
    if (useFeedPresent.getState() !== present) useFeedPresent.setState(present, true)
  }
  onDomChange(sync)
  sync()
}
