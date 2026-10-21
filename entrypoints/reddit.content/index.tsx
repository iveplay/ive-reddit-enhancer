import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import pageCss from '@/styles/page.scss?inline'
import '@/styles/theme.scss'
import { domReady } from '@/lib/dom'
import { loadSettings } from '@/lib/settings'
import { initFeedPresence } from '@/features/feed'
import { initGrid } from '@/features/grid'
import { initHidePromoted } from '@/features/hidePromoted'
import { initLeftSidebarMemory, initRightSidebar, initWideLayout } from '@/features/layout'
import { initMediaFilter } from '@/features/mediaFilter'
import { initRedgifsEmbeds } from '@/features/redgifsEmbeds'
import { initUserLinks } from '@/features/userLinks'
import { initViewer } from '@/features/viewer/controller'
import { initRegistry } from '@/features/viewer/registry'
import { Dock } from '@/components/dock/Dock'
import { Viewer } from '@/components/viewer/Viewer'

export default defineContentScript({
  matches: ['*://*.reddit.com/*'],
  // old.reddit.com is a different site altogether
  excludeMatches: ['*://old.reddit.com/*'],
  runAt: 'document_start',
  // Our CSS goes into the shadow root of the UI, not the page
  cssInjectionMode: 'ui',

  async main(ctx) {
    // Page styles first, before Reddit paints, so the layout doesn't jump
    const style = document.createElement('style')
    style.id = 'ive-reddit-enhancer'
    style.textContent = pageCss
    document.documentElement.appendChild(style)

    await loadSettings()
    // Class-based features can go on <html> right away
    initWideLayout()
    initHidePromoted()

    await domReady()
    // <head> exists now; keep the style there with the rest
    document.head.appendChild(style)

    initFeedPresence()
    initRedgifsEmbeds()
    initRightSidebar()
    initLeftSidebarMemory()
    initUserLinks()
    initGrid()
    initMediaFilter()
    initRegistry()
    initViewer()

    const ui = await createShadowRootUi(ctx, {
      name: 'ive-reddit-enhancer',
      position: 'inline',
      anchor: 'body',
      // Keys typed in our controls shouldn't trigger Reddit's shortcuts
      isolateEvents: true,
      onMount(container) {
        const root = ReactDOM.createRoot(container)
        root.render(
          <StrictMode>
            <Dock />
            <Viewer />
          </StrictMode>,
        )
        return root
      },
      onRemove(root) {
        root?.unmount()
      },
    })
    ui.mount()
  },
})
