# Reddit Enhancer

Vanilla JS + CSS content scripts injected into Reddit's new UI (Shreddit). No build tools, no dependencies, no framework.

## Project Structure

```
reddit-inject-script.js   # Main script — all 6 features in one IIFE
reddit-inject.css          # Layout overrides (full-width, sidebar hover-reveal)
```

## Features (in script order)

1. **RedGifs Embed Fix** — replaces broken `<shreddit-embed>` with working iframes, adds reload button
2. **Auto-close Left Sidebar** — collapses `#left-sidebar-container` via class toggle + MutationObserver
3. **Fullscreen Post Viewer** — overlay for images/videos/galleries/redgifs with keyboard/wheel nav (↑↓←→ Esc), slideshow (Space, speed button), post title in the bottom bar, preloads neighbouring images, auto-loads more posts near end of feed, resets its post list when the URL changes
4. **User Link Rewrite** — rewrites `/user/x` → `/user/x/submitted/`
5. **Grid View Toggle** — grid layout via floating button, with a column-count button (2–6) and a compact-cards button (media only, title on hover)
6. **Hide Promoted Posts** — CSS-only, hides `<shreddit-ad-post>` and related ad elements; the viewer skips them too

## Key Technical Details

- Targets Reddit's custom elements: `<shreddit-post>`, `<shreddit-feed>`, `<shreddit-embed>`, `<gallery-carousel>`
- Relies on data attributes: `post-type`, `content-href`, `permalink`, `author`, `subreddit-prefixed-name`
- MutationObserver-heavy — watches feed, sidebar, and embeds for dynamic changes
- Styles injected via `document.createElement("style")` appended to `<head>`
- Settings persist in `localStorage` under `re-*` keys (`re-grid`, `re-grid-cols`, `re-grid-compact`, `re-slide-seconds`) via the `store` helper
- Grid placeholders: flat feeds (home, custom feeds — posts are direct children of the feed) get one placeholder per post, kept in its own cell via `.grid-home`; batched feeds get full-width placeholders
- Compact cards hide the vote row by appending a `<style data-grid-compact>` into each post's shadow root
- Entry point: IIFE that waits for DOMContentLoaded or runs immediately

## Injection Method

Not a standalone extension — requires a host to inject into Reddit pages (browser extension content script, Tampermonkey, or DevTools console).

## Conventions

- No build step — edit files directly
- `"use strict"` at top of script
- Each feature is a self-contained function called from the main init block
- CSS classes/IDs used: `.redgifs-wrapper`, `.redgifs-reload-btn`, `.grid-view`, `.grid-home`, `.grid-compact`, `#fs-gallery`, `#fs-post-counter`, `#fs-slideshow-btn`, `#fs-slideshow-speed`, `#grid-toggle-btn`, `#grid-cols-btn`, `#grid-compact-btn`
- Author: Diemas (info@diemas.dev)
