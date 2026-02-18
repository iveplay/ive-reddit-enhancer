# Reddit Enhancer

Vanilla JS + CSS content scripts injected into Reddit's new UI (Shreddit). No build tools, no dependencies, no framework.

## Project Structure

```
reddit-inject-script.js   # Main script — all 5 features in one IIFE
reddit-inject.css          # Layout overrides (full-width, sidebar hover-reveal)
```

## Features (in script order)

1. **RedGifs Embed Fix** — replaces broken `<shreddit-embed>` with working iframes, adds reload button
2. **Auto-close Left Sidebar** — collapses `#left-sidebar-container` via class toggle + MutationObserver
3. **Fullscreen Post Viewer** — overlay for images/videos/galleries/redgifs with keyboard nav (↑↓←→ Esc), auto-loads more posts near end of feed
4. **User Link Rewrite** — rewrites `/user/x` → `/user/x/submitted/`
5. **Grid View Toggle** — 3-column grid layout via floating button

## Key Technical Details

- Targets Reddit's custom elements: `<shreddit-post>`, `<shreddit-feed>`, `<shreddit-embed>`, `<gallery-carousel>`
- Relies on data attributes: `post-type`, `content-href`, `permalink`, `author`, `subreddit-prefixed-name`
- MutationObserver-heavy — watches feed, sidebar, and embeds for dynamic changes
- Styles injected via `document.createElement("style")` appended to `<head>`
- Entry point: IIFE that waits for DOMContentLoaded or runs immediately

## Injection Method

Not a standalone extension — requires a host to inject into Reddit pages (browser extension content script, Tampermonkey, or DevTools console).

## Conventions

- No build step — edit files directly
- `"use strict"` at top of script
- Each feature is a self-contained function called from the main init block
- CSS classes/IDs used: `.redgifs-wrapper`, `.redgifs-reload-btn`, `.grid-view`, `#fs-gallery`, `#fs-post-counter`, `#grid-toggle-btn`
- Author: Diemas (info@diemas.dev)
