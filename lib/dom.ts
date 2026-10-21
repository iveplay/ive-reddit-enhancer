// One MutationObserver on the whole document, shared by every feature. Reddit
// fires mutations by the thousand while scrolling; subscribers run at most
// once per animation frame, after the dust of that frame has settled.

type Listener = () => void

const listeners = new Set<Listener>()
let observer: MutationObserver | null = null
let queued = false

function flush() {
  queued = false
  for (const listener of listeners) {
    try {
      listener()
    } catch (error) {
      console.error('[ive-reddit-enhancer]', error)
    }
  }
}

/** Call `listener` (throttled to one call per frame) whenever the page changes */
export function onDomChange(listener: Listener) {
  listeners.add(listener)
  if (!observer) {
    observer = new MutationObserver(() => {
      if (queued) return
      queued = true
      requestAnimationFrame(flush)
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })
  }
  return () => listeners.delete(listener)
}

/** Resolves once the document has a <body> to work with */
export const domReady = () =>
  new Promise<void>((resolve) => {
    if (document.readyState !== 'loading') resolve()
    else document.addEventListener('DOMContentLoaded', () => resolve(), { once: true })
  })

/** Add or remove one of our <style> blocks inside an element's shadow root */
export function setShadowStyle(host: Element | null | undefined, key: string, css: string, on: boolean) {
  const root = host?.shadowRoot
  if (!root) return
  const existing = root.querySelector(`style[data-ire-${key}]`)
  if (on && !existing) {
    const style = document.createElement('style')
    style.setAttribute(`data-ire-${key}`, '')
    style.textContent = css
    root.appendChild(style)
  } else if (!on && existing) {
    existing.remove()
  }
}

/** Toggle a class on <html>; page stylesheets key off these */
export const setRootClass = (name: string, on: boolean) =>
  document.documentElement.classList.toggle(name, on)

/** Reddit navigates without reloading; this changes when the page does */
export const pageKey = () => location.pathname + location.search
