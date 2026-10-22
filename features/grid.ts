import { onDomChange, setShadowStyle } from '@/lib/dom'
import { getSettings, watchSettings } from '@/lib/settings'
import { currentFeed } from './feed'
import { compactNumber, fullDate, timeAgo } from '@/lib/format'
import { ARROW_UP_SVG, COMMENT_SVG, EXTERNAL_SVG } from './icons'
import { postMeta } from './posts'

// Grid view: the feed laid out in 2–6 columns (1–4 on phones), optionally as compact cards
// (media only; title, subreddit/author and a "View post" link on hover).
// The feed gets classes (.ire-grid, .ire-grid-flat, .ire-grid-compact) that
// styles/page.scss acts on; the rest needs reaching into shadow roots.

// Home and custom feeds hold posts as direct children and Reddit virtualizes
// them one placeholder per post, so each placeholder must keep its own grid
// cell. Other feeds come in batches and swap whole rows out at once.
const isFlatFeedPage = () =>
  /^\/((best|hot|new|top|rising)\/?)?$/.test(location.pathname) ||
  /^\/user\/[^/]+\/m\/[^/]+/.test(location.pathname)

function isFlatFeed(feed: Element) {
  if (isFlatFeedPage()) return true
  if (feed.querySelector(':scope > faceplate-batch')) return false
  if (feed.querySelector(':scope > article')) return true
  // Everything is virtualized right now; keep whatever was decided before
  return feed.classList.contains('ire-grid-flat')
}

// The vote/comment row and NSFW/spoiler tags live inside each post's shadow
// root, out of reach of the page stylesheet
const COMPACT_SHADOW_CSS = `
  [data-testid="action-row"],
  .shreddit-post-container,
  #content-tag-container,
  shreddit-content-tags,
  .content-tags {
    display: none !important;
  }
  .condensed-post-title-heading {
    margin: 0 !important;
  }
`
// Galleries are built for a fixed 540px height; their inner wrappers carry
// that cap too. Make them fill whatever height the page stylesheet gives.
const GALLERY_SHADOW_CSS = `
  .relative,
  faceplate-carousel {
    height: 100% !important;
    max-height: none !important;
  }
`
const CAROUSEL_SHADOW_CSS = `
  :host {
    display: block;
  }
  .carousel-container,
  #carousel-window,
  #carousel-list {
    height: 100% !important;
    max-height: none !important;
  }
`
const DEFAULT_GALLERY_LIMIT = 1.25 // 4:5, until other tiles can be measured

// Profile posts report their "subreddit" as u_name
const communityHref = (name: string) => {
  const user = name.match(/^u[_/](.+)$/)
  return user ? `/user/${user[1]}/submitted/` : `/${name}/`
}

function metaLink(label: string, href: string, className?: string) {
  const a = document.createElement('a')
  a.href = href
  a.target = '_blank'
  a.textContent = label
  if (className) a.className = className
  // Don't also open the post (or the viewer) underneath
  a.addEventListener('click', (event) => event.stopPropagation())
  return a
}

// "3h · ▲ 1.2k · 💬 84", the line above the names
function postStats(post: Element) {
  const { created, score, comments } = postMeta(post)
  const parts: HTMLElement[] = []
  const part = (html: string, title: string) => {
    const span = document.createElement('span')
    span.innerHTML = html
    span.title = title
    parts.push(span)
  }
  if (created) part(timeAgo(created), fullDate(created))
  if (score !== null)
    part(`${ARROW_UP_SVG}${compactNumber(score)}`, `${score.toLocaleString()} points`)
  if (comments !== null)
    part(`${COMMENT_SVG}${compactNumber(comments)}`, `${comments.toLocaleString()} comments`)
  if (!parts.length) return null
  const line = document.createElement('div')
  line.className = 'ire-post-stats'
  line.append(...parts)
  return line
}

// Subreddit + author links and a "View post" link along the bottom of a tile
function addPostMeta(post: Element) {
  if (post.querySelector(':scope > .ire-post-meta')) return
  const subreddit = post.getAttribute('subreddit-prefixed-name')
  const author = post.getAttribute('author')
  const permalink = post.getAttribute('permalink')
  const meta = document.createElement('div')
  meta.className = 'ire-post-meta'
  const names = document.createElement('span')
  if (subreddit)
    names.appendChild(metaLink(subreddit.replace(/^u_/, 'u/'), communityHref(subreddit)))
  // A profile post's "subreddit" is its author; don't list them twice
  if (author && author !== '[deleted]' && subreddit !== `u_${author}`) {
    if (names.childNodes.length) names.append(' · ')
    names.appendChild(metaLink(`u/${author}`, `/user/${author}/submitted/`))
  }
  if (!names.childNodes.length && !permalink) return
  const stats = postStats(post)
  if (stats) meta.appendChild(stats)
  meta.appendChild(names)
  if (permalink) {
    const view = metaLink('View', permalink, 'ire-post-meta-view')
    view.insertAdjacentHTML('beforeend', EXTERNAL_SVG)
    meta.appendChild(view)
  }
  post.appendChild(meta)
}

// Reddit writes each single image/video's shape on its box as an inline
// aspect-ratio, already trimmed for tall media. The tallest of those is the
// limit galleries are held to, so they line up with their neighbours.
function tallestMediaRatio(feed: Element) {
  let tallest = 0
  feed.querySelectorAll<HTMLElement>('[data-aspect-ratio-container]').forEach((box) => {
    const [w = 0, h = 1] = box.style.aspectRatio.split('/').map(parseFloat)
    if (w > 0 && h > 0) tallest = Math.max(tallest, h / w)
  })
  return tallest || DEFAULT_GALLERY_LIMIT
}

function syncGalleries(feed: Element, grid: boolean) {
  const galleries = feed.querySelectorAll<HTMLElement>('gallery-carousel')
  if (!galleries.length) return
  const limit = grid ? tallestMediaRatio(feed) : 0
  galleries.forEach((gallery) => {
    if (grid) {
      const img = gallery.querySelector('li img:not([role="presentation"])')
      const ratio = Number(img?.getAttribute('height')) / Number(img?.getAttribute('width'))
      if (ratio > 0) {
        const value = Math.min(ratio, limit).toFixed(3)
        if (gallery.style.getPropertyValue('--ire-gallery-ratio') !== value)
          gallery.style.setProperty('--ire-gallery-ratio', value)
      }
    }
    setShadowStyle(gallery, 'gallery', GALLERY_SHADOW_CSS, grid)
    setShadowStyle(
      gallery.shadowRoot?.querySelector('faceplate-carousel'),
      'gallery',
      CAROUSEL_SHADOW_CSS,
      grid,
    )
  })
}

// Bring the current feed in line with the settings. Runs again whenever the
// page changes: infinite scroll keeps adding posts, and navigation replaces
// the feed (losing its classes).
function syncFeed() {
  const feed = currentFeed()
  if (!feed) return
  const { grid: options } = getSettings()
  const grid = options.on
  const compact = grid && options.compact
  feed.classList.toggle('ire-grid', grid)
  feed.classList.toggle('ire-grid-flat', grid && isFlatFeed(feed))
  feed.classList.toggle('ire-grid-compact', compact)
  feed.querySelectorAll('shreddit-post').forEach((post) => {
    setShadowStyle(post, 'compact', COMPACT_SHADOW_CSS, compact)
    if (compact) addPostMeta(post)
    else post.querySelector(':scope > .ire-post-meta')?.remove()
  })
  syncGalleries(feed, grid)
}

export function initGrid() {
  const applyCols = () => {
    const { cols, narrowCols } = getSettings().grid
    const style = document.documentElement.style
    style.setProperty('--ire-grid-cols', String(cols))
    style.setProperty('--ire-grid-cols-narrow', String(narrowCols))
  }
  watchSettings((s) => s.grid.cols, applyCols)
  watchSettings((s) => s.grid.narrowCols, applyCols)
  watchSettings((s) => s.grid.on, syncFeed)
  watchSettings((s) => s.grid.compact, syncFeed)
  onDomChange(syncFeed)
  applyCols()
  syncFeed()
}
