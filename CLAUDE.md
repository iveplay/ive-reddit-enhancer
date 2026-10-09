# Reddit Enhancer

Vanilla JS + CSS content scripts injected into Reddit's new UI (Shreddit). No build tools, no dependencies, no framework.

## Project Structure

```
reddit-inject-script.js   # Main script — all 8 features in one IIFE
reddit-inject.css          # Layout overrides (full-width, sidebar hover-reveal)
```

## Features (in script order)

1. **RedGifs Embed Fix** — replaces broken `<shreddit-embed>` with working iframes, adds reload button
2. **Auto-close Left Sidebar** — collapses `#left-sidebar-container` via class toggle + MutationObserver
3. **Fullscreen Post Viewer** — overlay for images/videos/galleries/redgifs with keyboard/wheel nav (↑↓←→ Esc), slideshow (Space; −/+ keys or the pill at the top right change seconds per post; progress bar along the top), post title in the bottom bar, preloads neighbouring images, auto-loads more posts near end of feed, resets its post list when the URL changes
4. **User Link Rewrite** — rewrites `/user/x` → `/user/x/submitted/`
5. **Grid View Toggle** — grid layout via floating button, with a column-count button (2–6) and a compact-cards button (media only, title on hover)
6. **Hide Promoted Posts** — CSS-only, hides `<shreddit-ad-post>` and related ad elements; the viewer skips them too
7. **Auto-scroll** — floating button above the viewer button scrolls the feed hands-free; a speed pill (8 levels) appears while it runs, and it holds still while the fullscreen viewer is open

8. **Redgifs player helper** — when the same file is also injected into `https://www.redgifs.com/ifr/*` frames, it presses the embed's own HD button, unmutes embeds opened by the fullscreen viewer (marked with a `#re-sound` hash), and posts the real clip length to the page for exact slideshow timing. Does nothing unless injected there.

## Key Technical Details

- Targets Reddit's custom elements: `<shreddit-post>`, `<shreddit-feed>`, `<shreddit-embed>`, `<gallery-carousel>`
- Relies on data attributes: `post-type`, `content-href`, `permalink`, `author`, `subreddit-prefixed-name`
- MutationObserver-heavy — watches feed, sidebar, and embeds for dynamic changes
- Styles injected via `document.createElement("style")` appended to `<head>`
- Settings persist in `localStorage` under `re-*` keys (`re-grid`, `re-grid-cols`, `re-grid-compact`, `re-slide-seconds`, `re-autoscroll-level`, `re-volume`) via the `store` helper
- Grid placeholders: flat feeds (home, custom feeds — posts are direct children of the feed) get one placeholder per post, kept in its own cell via `.grid-home`; batched feeds get full-width placeholders
- Compact cards hide the vote row by appending a `<style data-grid-compact>` into each post's shadow root
- Slideshow timing for redgifs: the embed is a cross-origin iframe and `api.redgifs.com` rejects requests from reddit.com (CORS), so the clip length comes from Reddit's own `<permalink>.json` (`preview.reddit_video_preview.duration`, also checked on `crosspost_parent_list`); falls back to 15s when that is missing
- Volume: one global `volume` (0–1, saved as `re-volume`) owned by the Reddit page. The viewer's slider/`M` key set it on its own `<video>`s and post `{source:"reddit-enhancer", event:"volume"}` to every Redgifs iframe; the frame helper sends `hello`/`playing` and always gets the current volume back
- Entry point: IIFE that waits for DOMContentLoaded or runs immediately

## Injection Method

For feature 8, the host must also inject this script into `https://www.redgifs.com/ifr/*` with frames enabled (e.g. `all_frames: true` for an extension, or an extra `@match` in Tampermonkey). The Redgifs embed hard-codes muted + SD on load and has no URL option, saved setting or message API to change that, so pressing its buttons from inside the frame is the only route.

Not a standalone extension — requires a host to inject into Reddit pages (browser extension content script, Tampermonkey, or DevTools console).

## Conventions

- No build step — edit files directly
- `"use strict"` at top of script
- Each feature is a self-contained function called from the main init block
- CSS classes/IDs used: `.redgifs-wrapper`, `.redgifs-reload-btn`, `.grid-view`, `.grid-home`, `.grid-compact`, `#fs-gallery`, `#fs-post-counter`, `#fs-controls`, `#fs-volume`, `#fs-volume-btn`, `#fs-volume-slider`, `#fs-slideshow`, `#fs-slideshow-btn`, `#fs-slideshow-speed`, `#fs-slideshow-progress`, `#auto-scroll`, `#auto-scroll-btn`, `.grid-post-meta`, `#grid-toggle-btn`, `#grid-cols-btn`, `#grid-compact-btn`
- Author: Diemas (info@diemas.dev)
