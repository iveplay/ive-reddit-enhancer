import { create } from 'zustand'
import { findArticle } from './posts'
import { showToast } from './viewer/store'

// Voting and saving, for the viewer and compact grid cards: presses Reddit's
// own buttons (still in the page where the cards hide them) and reads their
// state back. A post Reddit has virtualized away has no buttons to press.

const MENU = 'shreddit-post-overflow-menu'

const findPost = (id: string) =>
  findArticle(id)?.querySelector('shreddit-post') ?? document.getElementById(id)

const voteButton = (id: string, dir: 1 | -1) =>
  findPost(id)?.shadowRoot?.querySelector<HTMLElement>(
    dir > 0 ? 'button[upvote]' : 'button[downvote]',
  )

// Save has no button, only an item in the post's "..." menu
function saveItem(id: string) {
  const post = findPost(id)
  const menu = post?.shadowRoot?.querySelector(MENU) ?? post?.querySelector(MENU)
  return menu?.shadowRoot?.querySelector<HTMLElement>('#post-overflow-save [role="menuitem"]')
}

const isPressed = (button: Element | null | undefined) =>
  button?.getAttribute('aria-pressed') === 'true'

/** The post's vote, saved state and live score; null score = Reddit isn't showing one */
export function readPostState(id: string) {
  const up = voteButton(id, 1)
  const number = up?.parentElement?.querySelector('faceplate-number')?.getAttribute('number')
  return {
    upvoted: isPressed(up),
    downvoted: isPressed(voteButton(id, -1)),
    // The item reads "Save" until the post is saved
    saved: !/^\s*save\s*$/i.test(saveItem(id)?.textContent ?? 'save'),
    score: number ? Number(number) : null,
  }
}

/** Goes up when it's time to read the buttons again */
export const useActionTick = create<number>()(() => 0)

// Reddit may take a moment to update its buttons, and changes inside a shadow
// root don't reach onDomChange, so look more than once
export function refreshPostActions() {
  for (const delay of [200, 700, 2000])
    setTimeout(() => useActionTick.setState((tick) => tick + 1, true), delay)
}

function press(control: HTMLElement | null | undefined) {
  if (!control) return showToast("Reddit hasn't loaded this post right now")
  control.click()
  refreshPostActions()
}

export const votePost = (id: string, dir: 1 | -1) => press(voteButton(id, dir))
export const toggleSavePost = (id: string) => press(saveItem(id))
