# IVE Reddit Enhancer

Browser extension for Reddit's new UI (Shreddit): grid view, fullscreen viewer with slideshow, media filter, auto-scroll, sidebar tweaks, Redgifs fixes. Built with WXT + React + TypeScript, set up like `../iveplay/ive/apps/extension`; visual style follows `../iveplay/ive/apps/companion` (daisyUI "dim" palette, brand gradient, Frankfurter logo).

The original injected-script proof of concept lives in `legacy/` (reference only, not built). `legacy/examples/` holds stripped Reddit DOM snapshots.

## Commands

- `pnpm dev` — Chrome with the extension loaded (profile persisted in `.wxt/chrome-data`, opens reddit.com)
- `pnpm dev:firefox`, `pnpm build`, `pnpm build:firefox`, `pnpm zip`
- `pnpm compile` — type-check

## Structure

```
entrypoints/
  reddit.content/index.tsx  # main content script (document_start): page CSS, features, shadow-root UI
  redgifs.content.ts        # runs inside https://www.redgifs.com/ifr/* frames (HD, sound, reports duration/audio)
  background.ts             # GIF_SECONDS: fetches a GIF and returns one play's length
  popup/                    # the settings (feature toggles, defaults); Tailwind + daisyUI
features/                   # one module per feature, each exports init*()
  viewer/ registry.ts store.ts controller.ts   # post list, zustand state, all viewer logic
  posts.ts                  # media extraction (viewer) + classification (filter)
components/
  dock/ viewer/             # injected UI, SCSS modules, rendered in a shadow root
  settings/controls.tsx     # popup building blocks
lib/
  settings.ts               # typed settings in browser.storage.local, live across contexts
  dom.ts                    # shared rAF-throttled MutationObserver (onDomChange), helpers
  frames.ts                 # page <-> Redgifs frame postMessage protocol
  device.ts                 # NARROW_QUERY / TOUCH_QUERY + useMedia, for phone-specific UI
styles/
  page.scss                 # styles for Reddit's own DOM, injected via ?inline
  theme.scss                # --ive-* tokens for the shadow-root UI
  app.css                   # Tailwind + daisyUI theme for the popup
```

## Conventions

- Settings: one `Settings` object (`lib/settings.ts`), read with `getSettings()` / `useSettings`, changed with `updateSettings(patch)`, reacted to with `watchSettings(select, fn)`. Every feature checks its `features.*` flag at run time so toggles apply live without reload.
- Page DOM classes/ids are prefixed `ire-` (`html.ire-wide`, `.ire-sidebar*`, `shreddit-feed.ire-grid`/`.ire-grid-flat`/`.ire-grid-compact`, `article.ire-filtered-out`, `.ire-redgifs*`, `.ire-post-meta`, `#ire-sidebar-rail`, `#ire-sidebar-head`, `html.ire-sidebar-railed`). All page CSS is keyed off these.
- Never add a new MutationObserver for the body; use `onDomChange`.
- Injected UI uses `--ive-*` tokens from `styles/theme.scss`; extension pages use daisyUI classes. Icons: `@tabler/icons-react` (plain SVG strings in `features/icons.ts` for elements put into Reddit's DOM).
- Prettier: single quotes, no semicolons, width 100.

## Key technical details

- Targets `<shreddit-feed>`, `article[data-post-id]`, `<shreddit-post>` (attrs `post-type`, `content-href`, `permalink`, `author`, `subreddit-prefixed-name`, `post-title`), `<gallery-carousel>`, `<shreddit-player packaged-media-json>`, `<shreddit-embed html>`.
- Viewer keeps its own post registry because Reddit virtualizes the feed; reset on navigation (not while open).
- Slideshow timing: images use the chosen seconds; videos play to the end (repeat short clips); GIFs are measured by the background (frame delays) and shown for whole plays; Redgifs length comes from `<permalink>.json`, replaced by the real duration from the frame helper's `playing` message.
- "With sound" filter: Reddit videos via `/by_id/<ids>.json` (`has_audio`), Redgifs via the frame helper's `audio` message.
- Volume (`settings.viewer.volume`) is owned by the page and posted to every Redgifs frame.
- Mobile: phones = `max-width: 640px` (keep SCSS media queries in step with `lib/device.ts`), touch = `(hover: none) and (pointer: coarse)`. On phones the dock is a bottom bar, the viewer's post info overlays the media, and the grid uses `grid.narrowCols`. Viewer touch gestures live in `components/viewer/useGestures.ts` (touch pointers only; mouse/keys untouched); swipes/taps inside a Redgifs frame are forwarded by the frame helper as `swipe`/`tap` messages.

Author: Diemas (info@diemas.dev)
