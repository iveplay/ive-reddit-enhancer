import { matches, TOUCH_QUERY } from '@/lib/device'
import { onDomChange, setRootClass } from '@/lib/dom'
import { getSettings, updateSettings, watchSettings } from '@/lib/settings'
import { CHEVRON_LEFT_SVG } from './icons'

// Page layout: the feed fills the window, and the right sidebar steps out of
// the way. All the styling lives in styles/page.scss, keyed off classes on
// <html>, so turning an option off in the settings undoes it on the spot.

export const initWideLayout = () => setRootClass('ire-wide', true)

// Neither sidebar feature does anything on a touch screen: the rail works by
// hovering, and phones show the left nav as a drawer
const touch = () => matches(TOUCH_QUERY)

// Collapsed, the sidebar floats just past the right edge with only a thin
// rail showing; hovering the rail glides rail and sidebar in together over the
// page. The arrow on the rail pins the sidebar back into the page beside the
// feed; the arrow then moves into a small row at the top of the sidebar, so it
// never covers the sidebar's own content. All state lives on <html>, so it
// survives Reddit replacing the sidebar element on navigation.
export function initRightSidebar() {
  const rail = document.createElement('div')
  rail.id = 'ire-sidebar-rail'
  const head = document.createElement('div')
  head.id = 'ire-sidebar-head'
  const button = document.createElement('button')
  button.id = 'ire-sidebar-btn'
  button.innerHTML = CHEVRON_LEFT_SVG

  const enabled = () => getSettings().features.rightSidebar && !touch()
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

  // The sidebar and rail start under Reddit's header, whatever its height
  const measureHeader = () => {
    const bottom = document.querySelector('header')?.getBoundingClientRect().bottom
    const height = bottom && bottom > 0 && bottom < 200 ? Math.round(bottom) : 56
    document.documentElement.style.setProperty('--ire-header', `${height}px`)
  }

  // Reddit hides the sidebar on narrow windows (and some pages have none);
  // the rail goes with it. Only does real work when something changed.
  let lastSidebar: Element | null = null
  let lastVisible: boolean | null = null
  const syncRail = (force = false) => {
    const sidebar = document.getElementById('right-sidebar-container')
    const sidebarChanged = sidebar !== lastSidebar
    if (!force && !sidebarChanged && rail.isConnected && (!pinned() || head.isConnected)) return
    lastSidebar = sidebar
    if (sidebarChanged) measureHeader()
    const visible = enabled() && !!sidebar && getComputedStyle(sidebar).display !== 'none'
    if (visible !== lastVisible || force || sidebarChanged) {
      lastVisible = visible
      rail.hidden = !visible
      // Room for the rail along the right edge, so it covers no content
      setRootClass('ire-sidebar-railed', visible && !pinned())
    }
    if (!rail.isConnected) document.body.appendChild(rail)
    // Pinned: the arrow sits in its own row at the top of the sidebar
    if (enabled() && pinned() && sidebar) {
      if (head.parentElement !== sidebar) sidebar.prepend(head)
      if (button.parentElement !== head) head.appendChild(button)
    } else {
      head.remove()
      if (button.parentElement !== rail) rail.appendChild(button)
    }
  }

  const render = () => {
    setRootClass('ire-sidebar', enabled())
    setRootClass('ire-sidebar-pinned', enabled() && pinned())
    setPeek(false)
    button.title = pinned() ? 'Collapse sidebar' : 'Keep sidebar open'
    measureHeader()
    syncRail(true)
  }

  watchSettings((s) => s.features.rightSidebar, render)
  watchSettings((s) => s.rightSidebarPinned, render)
  window.matchMedia(TOUCH_QUERY).addEventListener('change', render)
  window.addEventListener('resize', () => {
    measureHeader()
    syncRail(true)
  })
  onDomChange(() => syncRail())
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
  // Below this width the nav is a drawer that slides over the page; opening
  // it there isn't the user's sidebar preference, and pressing it would cover
  // the page on a phone
  const docked = () => matches('(min-width: 1200px)') && !touch()

  let userClicked = false
  document.addEventListener(
    'click',
    (event) => {
      if (!event.isTrusted || !(event.target instanceof Element) || !docked()) return
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
    if (!docked()) return
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
