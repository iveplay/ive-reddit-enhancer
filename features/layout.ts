import { onDomChange, setRootClass } from '@/lib/dom'
import { getSettings, updateSettings, watchSettings } from '@/lib/settings'
import { CHEVRON_LEFT_SVG } from './icons'

// Page layout: the feed fills the window, and the right sidebar steps out of
// the way. All the styling lives in styles/page.scss, keyed off classes on
// <html>, so turning an option off in the settings undoes it on the spot.

export const initWideLayout = () => setRootClass('ire-wide', true)

// Collapsed, the sidebar floats just past the right edge with only a thin
// rail showing; hovering the rail glides rail and sidebar in together over the
// page. The arrow on the rail pins the sidebar back into the page beside the
// feed, where only the arrow is left. All state lives on <html>, so it
// survives Reddit replacing the sidebar element on navigation.
export function initRightSidebar() {
  const rail = document.createElement('div')
  rail.id = 'ire-sidebar-rail'
  const button = document.createElement('button')
  button.id = 'ire-sidebar-btn'
  button.innerHTML = CHEVRON_LEFT_SVG
  rail.appendChild(button)

  const enabled = () => getSettings().features.rightSidebar
  const pinned = () => getSettings().rightSidebarPinned

  const setPeek = (on: boolean) => setRootClass('ire-sidebar-peek', on)

  // Out over the page while the pointer is on the rail or the sidebar. The
  // arrow itself changes nothing, so it holds still and can be clicked.
  document.addEventListener('mouseover', (event) => {
    const target = event.target
    if (!(target instanceof Element) || target.closest('#ire-sidebar-btn')) return
    setPeek(
      enabled() && !pinned() && !!target.closest('#ire-sidebar-rail, #right-sidebar-container'),
    )
  })
  document.documentElement.addEventListener('mouseleave', () => setPeek(false))

  button.onclick = () => updateSettings({ rightSidebarPinned: !pinned() })

  // Reddit hides the sidebar on narrow windows (and some pages have none);
  // the rail goes with it
  const syncRail = () => {
    const sidebar = document.getElementById('right-sidebar-container')
    rail.hidden = !enabled() || !sidebar || getComputedStyle(sidebar).display === 'none'
    if (!rail.isConnected) document.body.appendChild(rail)
  }

  const render = () => {
    setRootClass('ire-sidebar', enabled())
    setRootClass('ire-sidebar-pinned', enabled() && pinned())
    setPeek(false)
    button.title = pinned() ? 'Collapse sidebar' : 'Keep sidebar open'
    syncRail()
  }

  watchSettings((s) => s.features.rightSidebar, render)
  watchSettings((s) => s.rightSidebarPinned, render)
  window.addEventListener('resize', syncRail)
  onDomChange(syncRail)
  render()
}

// Reddit's own collapse button for the left sidebar forgets its state when the
// browser restarts. Remember what it was last set to, and press the matching
// button again on load if Reddit opens the sidebar the other way. The nav
// reports its state as expanded="1" / "0" and has separate expand and
// collapse buttons (only one of them visible at a time).
export function initLeftSidebarMemory() {
  const NAV = 'flex-left-nav-container#left-sidebar-container'
  const EXPAND = '#flex-nav-expand-button'
  const COLLAPSE = '#flex-nav-collapse-button'

  let userClicked = false
  document.addEventListener(
    'click',
    (event) => {
      if (!event.isTrusted || !(event.target instanceof Element)) return
      const button = event.target.closest(`${EXPAND}, ${COLLAPSE}`)
      if (!button) return
      userClicked = true
      updateSettings({ leftSidebarExpanded: button.matches(EXPAND) })
    },
    true,
  )

  // Bring each new copy of the nav in line with the saved state. Reddit may
  // render the buttons before their click handlers are ready, so keep trying
  // for a few seconds, but stop as soon as the user presses one themselves.
  const settled = new WeakSet<Element>()
  const tries = new WeakMap<Element, number>()
  function apply() {
    const { features, leftSidebarExpanded } = getSettings()
    if (!features.leftSidebarMemory || leftSidebarExpanded === null || userClicked) return
    const nav = document.querySelector(NAV)
    if (!nav || settled.has(nav) || !nav.hasAttribute('expanded')) return
    const wanted = leftSidebarExpanded ? '1' : '0'
    if (nav.getAttribute('expanded') === wanted) return void settled.add(nav)
    const count = tries.get(nav) ?? 0
    if (count >= 10) return void settled.add(nav)
    tries.set(nav, count + 1)
    nav.querySelector<HTMLElement>(leftSidebarExpanded ? EXPAND : COLLAPSE)?.click()
    setTimeout(apply, 300)
  }

  onDomChange(apply)
  apply()
}
