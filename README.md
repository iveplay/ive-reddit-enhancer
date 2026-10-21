# IVE Reddit Enhancer

A browser extension that makes Reddit better for browsing media.

- **Grid view**: 2–6 columns, with optional compact cards (media only, details on hover)
- **Fullscreen viewer**: click any image, gallery or video. ↑↓ for posts, ←→ for gallery images, mouse wheel through both, Space for a slideshow, −/+ for its speed, K to play/pause, M to mute, Esc to close
- **Media filter**: all posts, photos only, videos & GIFs, or only videos with sound
- **Auto-scroll** with eight speeds
- **Layout**: full-width feed, right sidebar tucked behind a hover rail, left sidebar state remembered
- **Clean-up**: promoted posts hidden, profile links go to the user's posts
- **Redgifs**: working embeds in the feed, HD by default, sound in the viewer

Every feature can be switched on or off from the toolbar popup, and changes apply to open tabs straight away. Things you do on the page (grid/list, columns, filter, viewer, auto-scroll) live in the dock in the bottom corner.

## Development

```sh
pnpm install
pnpm dev            # Chrome with the extension loaded
pnpm dev:firefox
pnpm build          # production build in .output/
pnpm zip            # store-ready zip
```

The original proof-of-concept script is kept in `legacy/` for reference.
