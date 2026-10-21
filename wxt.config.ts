import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'wxt'

// chrome-launcher writes its log into the profile folder and fails when the
// folder doesn't exist yet (fresh clone, or after .wxt was cleared)
const chromiumProfile = resolve('.wxt/chrome-data')
mkdirSync(chromiumProfile, { recursive: true })

// See https://wxt.dev/api/config.html
export default defineConfig({
  webExt: {
    // Persist the Chrome profile between dev runs (stays logged in to Reddit).
    // On Windows, --user-data-dir via chromiumArgs is unreliable; use an
    // absolute chromiumProfile + keepProfileChanges instead.
    chromiumProfile,
    keepProfileChanges: true,
    startUrls: ['https://www.reddit.com/'],
  },
  modules: ['@wxt-dev/module-react', '@wxt-dev/auto-icons'],
  autoIcons: {
    developmentIndicator: 'overlay',
  },
  // Tailwind + daisyUI only style the extension's own pages (popup, options).
  // The UI injected into Reddit uses SCSS modules inside a shadow root.
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'IVE Reddit Enhancer',
    description: 'Grid view, fullscreen viewer, slideshow and media filters for Reddit.',
    homepage_url: 'https://iveplay.io',
    permissions: ['storage'],
    // reddit.com for the page itself; the media hosts so the background can
    // read GIF files for exact slideshow timing.
    host_permissions: [
      '*://*.reddit.com/*',
      '*://*.redd.it/*',
      '*://*.redgifs.com/*',
      '*://*.imgur.com/*',
    ],
    browser_specific_settings: {
      gecko: {
        id: 'reddit-enhancer@iveplay.io',
        strict_min_version: '128.0',
        data_collection_permissions: {
          required: ['none'],
        },
      },
    },
  },
})
