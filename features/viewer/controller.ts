import { onFrameMessage, REDGIFS_ORIGIN, FRAME_SOURCE, type PageMessage } from '@/lib/frames'
import { fetchGifSeconds } from '@/lib/messages'
import { getSettings, SLIDE_SPEEDS, updateSettings, watchSettings } from '@/lib/settings'
import { currentFeed } from '../feed'
import { passesMediaFilter, setHasAudio } from '../mediaFilter'
import { findArticle, isGifUrl, isMediaImage, type Post } from '../posts'
import { indexOfPost, postAt, postCount, scanPosts } from './registry'
import { showToast, useViewer } from './store'

// Everything the fullscreen viewer does, apart from drawing itself
// (components/viewer/Viewer.tsx renders from the store and reports back what
// its media elements do).

const state = () => useViewer.getState()
const set = useViewer.setState
export const currentPost = () => postAt(state().index)

// ------------------------------------------------------------------
// Media elements on screen, registered by the Viewer component
// ------------------------------------------------------------------

let frame: HTMLIFrameElement | null = null
let video: HTMLVideoElement | null = null
export const setViewerFrame = (el: HTMLIFrameElement | null) => void (frame = el)
export const setViewerVideo = (el: HTMLVideoElement | null) => void (video = el)

// ------------------------------------------------------------------
// Opening, closing, moving
// ------------------------------------------------------------------

let shownAt = 0 // when the current post went up

// `fromEnd`: a gallery opens on its last image (coming back to it from below)
function show(index: number, fromEnd = false) {
  shownAt = Date.now()
  const post = postAt(index)
  const last = post?.type === 'gallery' ? post.srcs.length - 1 : 0
  set({ index, galleryIndex: fromEnd ? last : 0, gifPaused: false })
  if (!post) return
  // Keep the (hidden) feed under the current post, so closing lands there
  // and Reddit keeps loading what comes next
  const article = findArticle(post.id)
  if (article) article.scrollIntoView({ behavior: 'instant', block: 'center' })
  // Reddit may have swapped the post for a placeholder; near the end of the
  // list, pull in the next page anyway
  else if (index >= postCount() - 3) loadMorePosts()
  preload(index + 1)
  preload(index - 1)
  scheduleSlide()
}

// First index from `index` onwards (in direction `dir`) whose post passes the
// media filter; out of range if there is none
function nextMatching(index: number, dir: number) {
  while (index >= 0 && index < postCount()) {
    const post = postAt(index)
    if (post && passesMediaFilter(post.type, post.id)) break
    index += dir
  }
  return index
}

function attach() {
  set({ open: true })
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('wheel', onWheel, { passive: false, capture: true })
}

/** Open at a given post (clicked in the feed), or at the post in view */
export function openViewer(postId?: string) {
  if (state().open) return
  scanPosts()
  let start: number
  if (postId) {
    start = indexOfPost(postId)
    if (start === -1) return
  } else {
    const visible = visiblePostIndex()
    start = nextMatching(visible, 1)
    if (start >= postCount()) start = nextMatching(visible, -1)
    if (start < 0) return showToast('No media posts on this page')
  }
  attach()
  show(start)
}

export function closeViewer() {
  if (!state().open) return
  clearTimeout(slideTimer)
  window.removeEventListener('keydown', onKey, true)
  window.removeEventListener('wheel', onWheel, true)
  const post = currentPost()
  set({ open: false, slideshow: false, progress: { seconds: 0, key: Date.now() } })
  if (post) findArticle(post.id)?.scrollIntoView({ behavior: 'instant', block: 'center' })
}

/** Previous/next post. Past the last known one, ask Reddit for more. */
export function step(dir: number, intoGallery = false) {
  const next = nextMatching(state().index + dir, dir)
  if (next >= 0 && next < postCount()) return show(next, intoGallery && dir < 0)
  if (dir > 0) {
    loadMorePosts()
    // The slideshow keeps knocking until the next page has registered
    clearTimeout(slideTimer)
    if (state().slideshow) slideTimer = setTimeout(() => step(1), 2000)
  }
}

/**
 * Next/previous thing to look at: the next image of a gallery, else the next
 * post. Going back into a gallery starts at its last image. Used by the
 * slideshow and the mouse wheel; ↑↓ jump whole posts. With "through
 * galleries" off, it jumps whole posts too (←→ still page through).
 */
export function advance(dir: number) {
  const through = getSettings().viewer.throughGalleries
  const post = currentPost()
  const galleryIndex = state().galleryIndex
  if (
    through &&
    post?.type === 'gallery' &&
    galleryIndex + dir >= 0 &&
    galleryIndex + dir < post.srcs.length
  )
    moveGallery(dir)
  else step(dir, through)
}

export function moveGallery(dir: number) {
  const post = currentPost()
  if (post?.type !== 'gallery') return
  const next = state().galleryIndex + dir
  if (next < 0 || next >= post.srcs.length) return
  set({ galleryIndex: next, gifPaused: false })
  preloadImage(post.srcs[next + 1])
  scheduleSlide()
}

function visiblePostIndex() {
  const middle = window.innerHeight / 2
  let closest: string | undefined
  let distance = Infinity
  document.querySelectorAll<HTMLElement>('article[data-post-id]').forEach((article) => {
    const rect = article.getBoundingClientRect()
    if (!rect.height) return
    const d = Math.abs(rect.top + rect.height / 2 - middle)
    if (d < distance) {
      distance = d
      closest = article.dataset.postId
    }
  })
  const index = closest ? indexOfPost(closest) : -1
  return index === -1 ? 0 : index
}

// Scroll the (hidden) feed to its end so Reddit fetches the next page
function loadMorePosts() {
  const feed = currentFeed()
  const target = feed?.querySelector(':scope > [slot="load-after"]') ?? feed?.lastElementChild
  target?.scrollIntoView({ behavior: 'instant', block: 'end' })
}

// ------------------------------------------------------------------
// Preloading
// ------------------------------------------------------------------

const preloads: HTMLImageElement[] = [] // kept alive until they finish

function preloadImage(src: string | undefined) {
  if (!src || !getSettings().viewer.preload) return
  const img = new Image()
  img.src = src
  preloads.push(img)
  if (preloads.length > 8) preloads.shift()
}

function preload(index: number) {
  const post = postAt(index)
  if (!post) return
  if (post.type === 'gallery') preloadImage(post.srcs[0])
  else if (post.type === 'image' || post.type === 'gif') preloadImage(post.src)
  // Look the clip length up ahead, so the slide starts on schedule
  else if (post.type === 'redgif' && state().slideshow) clipLength(post)
}

// ------------------------------------------------------------------
// Slideshow
// ------------------------------------------------------------------

let slideTimer: ReturnType<typeof setTimeout> | undefined
const slideSeconds = () => getSettings().viewer.slideSeconds

function startSlideTimer(seconds: number) {
  clearTimeout(slideTimer)
  slideTimer = setTimeout(() => advance(1), seconds * 1000)
  set({ progress: { seconds, key: Date.now() } })
}

// Whole plays of a clip, enough of them to cover the chosen seconds. Already
// past that (slideshow switched on late): finish the current play.
function playsLeft(length: number, elapsed: number) {
  const plays = Math.max(1, Math.ceil(slideSeconds() / length))
  const left = plays * length - elapsed
  return left >= 1 ? left : Math.max(1, length - (elapsed % length))
}

function scheduleSlide() {
  clearTimeout(slideTimer)
  set({ progress: { seconds: 0, key: Date.now() } })
  const post = currentPost()
  if (!state().open || !state().slideshow || !post) return
  if (post.type === 'video') return // advances on "ended", see onVideoEnded
  const shown = shownAt
  const stillHere = () => state().open && state().slideshow && shownAt === shown

  if (post.type === 'redgif') {
    // A safe guess first, then the real clip length once Reddit has answered
    startSlideTimer(Math.max(slideSeconds(), REDGIF_FALLBACK_SECONDS))
    clipLength(post).then((length) => {
      if (length && stillHere()) startSlideTimer(redgifSecondsLeft(length))
    })
    return
  }

  const src = post.type === 'gallery' ? post.srcs[state().galleryIndex] : post.src
  if (!src || !/\.gif(\?|$)|format=gif/i.test(src)) return startSlideTimer(slideSeconds())

  // A GIF stays up for whole plays. Wait for it to load and be measured.
  startSlideTimer(Math.max(slideSeconds(), GIF_WAIT_SECONDS))
  const galleryIndex = state().galleryIndex
  Promise.all([fetchGifSeconds(src), imageLoadedAt(src)]).then(([length, loadedAt]) => {
    if (!stillHere() || state().galleryIndex !== galleryIndex) return
    const elapsed = (Date.now() - loadedAt) / 1000
    // Not animated, or the file couldn't be read: treat it as a picture
    if (!length) return startSlideTimer(Math.max(1, slideSeconds() - elapsed))
    startSlideTimer(playsLeft(length, elapsed))
  })
}

export function toggleSlideshow() {
  const slideshow = !state().slideshow
  set({ slideshow })
  if (video?.ended) {
    if (slideshow) return step(1)
    video.play().catch(() => {})
  }
  scheduleSlide()
}

/** dir -1 = faster (fewer seconds per post), +1 = slower */
export function changeSlideSpeed(dir: number) {
  // The saved value may not be one of the steps; start from the nearest
  const current = slideSeconds()
  let i = 0
  SLIDE_SPEEDS.forEach((seconds, n) => {
    if (Math.abs(seconds - current) < Math.abs(SLIDE_SPEEDS[i]! - current)) i = n
  })
  i = Math.min(SLIDE_SPEEDS.length - 1, Math.max(0, i + dir))
  updateSettings({ viewer: { slideSeconds: SLIDE_SPEEDS[i] } })
}

/**
 * In a slideshow a video plays through (short clips repeat until they've had
 * the chosen time), then hands over to the next post.
 */
export function onVideoEnded(el: HTMLVideoElement) {
  if (!state().slideshow) return
  if (Date.now() - shownAt < slideSeconds() * 1000) el.play().catch(() => {})
  else step(1)
}

// GIFs: an <img> never says when it has played through, so the background
// reads the file and adds up its frame delays. The countdown starts when the
// image has loaded, which is when the GIF starts playing.
const GIF_WAIT_SECONDS = 15 // longest wait for a GIF to load and be measured
let imageLoad: { src: string; at: Promise<number>; resolve: (at: number) => void } | null = null

function imageLoadedAt(src: string) {
  if (imageLoad?.src !== src) {
    let resolve!: (at: number) => void
    const at = new Promise<number>((r) => (resolve = r))
    imageLoad = { src, at, resolve }
  }
  return imageLoad.at
}

/** Called by the Viewer when an image has loaded */
export function onImageLoaded(src: string) {
  imageLoadedAt(src)
  imageLoad!.resolve(Date.now())
}

// Redgifs: the clip plays in another site's iframe, so the viewer can't see
// it end, and Redgifs' API refuses requests from reddit.com. Reddit's own
// data for the post usually has the clip length, so ask Reddit. When the frame
// helper runs, it reports the true length and when playback really started.
const REDGIF_FALLBACK_SECONDS = 15 // when the length can't be found
const REDGIF_LOAD_SECONDS = 2 // head start for the embed to begin playing
const clipLengths = new Map<string, Promise<number | null>>()
let playStart = { shownAt: 0, at: 0 }

interface RedditVideoData {
  preview?: { reddit_video_preview?: { duration?: number } }
  secure_media?: { reddit_video?: { duration?: number } }
  media?: { reddit_video?: { duration?: number } }
  crosspost_parent_list?: RedditVideoData[]
}

function clipLength(post: Post): Promise<number | null> {
  if (!post.permalink) return Promise.resolve(null)
  let length = clipLengths.get(post.id)
  if (!length) {
    const url = post.permalink.replace(/\/?$/, '/') + '.json?raw_json=1'
    length = fetch(url, { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => {
        const data: RedditVideoData | undefined = json?.[0]?.data?.children?.[0]?.data
        // A crosspost keeps its media details on the original post
        for (const item of [data, ...(data?.crosspost_parent_list ?? [])]) {
          const seconds =
            item?.preview?.reddit_video_preview?.duration ??
            item?.secure_media?.reddit_video?.duration ??
            item?.media?.reddit_video?.duration
          if (seconds && seconds > 0) return seconds
        }
        return null
      })
      .catch(() => null)
    clipLengths.set(post.id, length)
  }
  return length
}

function redgifSecondsLeft(length: number) {
  // Count from the real start of playback once the frame has reported it
  const exact = playStart.shownAt === shownAt
  const elapsed = (Date.now() - (exact ? playStart.at : shownAt)) / 1000
  return playsLeft(length, elapsed - (exact ? 0 : REDGIF_LOAD_SECONDS))
}

// ------------------------------------------------------------------
// Volume: one level for the viewer's videos and every Redgifs embed
// ------------------------------------------------------------------

const volumeMessage = (): PageMessage => ({
  source: FRAME_SOURCE,
  event: 'volume',
  volume: getSettings().viewer.volume,
})

let volumeBeforeMute = getSettings().viewer.volume || 1

export function setVolume(volume: number) {
  volume = Math.min(1, Math.max(0, volume))
  if (volume > 0) volumeBeforeMute = volume
  updateSettings({ viewer: { volume } })
}

export const toggleMute = () => setVolume(getSettings().viewer.volume > 0 ? 0 : volumeBeforeMute)

function broadcastVolume() {
  const frames = [...document.querySelectorAll('iframe'), ...(frame ? [frame] : [])]
  for (const f of frames) {
    if (/redgifs\.com/.test(f.src)) f.contentWindow?.postMessage(volumeMessage(), REDGIFS_ORIGIN)
  }
}

/** The image on screen, for image, GIF and gallery posts */
export function currentImageSrc() {
  const post = currentPost()
  if (post?.type === 'gallery') return post.srcs[state().galleryIndex]
  return post?.type === 'image' || post?.type === 'gif' ? post.src : undefined
}

/** Play/pause what's on screen: our own <video>, the Redgifs player, a GIF */
export function togglePlay() {
  const src = currentImageSrc()
  if (src) {
    if (isGifUrl(src)) set({ gifPaused: !state().gifPaused })
    return
  }
  if (video) {
    if (video.paused) video.play().catch(() => {})
    else video.pause()
    return
  }
  frame?.contentWindow?.postMessage(
    { source: FRAME_SOURCE, event: 'toggle-play' } satisfies PageMessage,
    REDGIFS_ORIGIN,
  )
}

// ------------------------------------------------------------------
// Input
// ------------------------------------------------------------------

const KEYS: Record<string, () => void> = {
  ArrowUp: () => step(-1),
  ArrowDown: () => step(1),
  ArrowLeft: () => moveGallery(-1),
  ArrowRight: () => moveGallery(1),
  ' ': toggleSlideshow,
  m: toggleMute,
  k: togglePlay,
  '-': () => changeSlideSpeed(-1),
  _: () => changeSlideSpeed(-1),
  '+': () => changeSlideSpeed(1),
  '=': () => changeSlideSpeed(1),
  Escape: closeViewer,
}

function onKey(event: KeyboardEvent) {
  // Keys typed into our own controls (the volume slider) stay there
  if (event.key !== 'Escape' && event.composedPath()[0] instanceof HTMLInputElement) return
  if (event.ctrlKey || event.metaKey || event.altKey) return
  const action = KEYS[event.key.length === 1 ? event.key.toLowerCase() : event.key]
  if (!action) return
  event.preventDefault()
  // Keep Reddit's own shortcuts out of it
  event.stopPropagation()
  action()
}

/**
 * A finger swipe: up/down for the next/previous post, sideways through a
 * gallery's images (like ←→) and on into the neighbouring posts. `dir` +1 =
 * forward (swiped up or to the left).
 */
export function swipe(axis: 'x' | 'y', dir: number) {
  if (axis === 'y') return step(dir)
  const post = currentPost()
  const next = state().galleryIndex + dir
  if (post?.type === 'gallery' && next >= 0 && next < post.srcs.length) moveGallery(dir)
  else step(dir, true)
}

// One wheel gesture = one post, rather than flying through the feed
let wheelLock = false
function wheelStep(deltaY: number) {
  if (wheelLock || Math.abs(deltaY) < 10) return
  wheelLock = true
  setTimeout(() => (wheelLock = false), 250)
  advance(deltaY > 0 ? 1 : -1)
}

function onWheel(event: WheelEvent) {
  event.preventDefault()
  wheelStep(event.deltaY)
}

// Click media in the feed to open the viewer there
function onFeedClick(event: MouseEvent) {
  if (state().open || !getSettings().features.viewer) return
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) return
  const target = event.target
  if (!(target instanceof Element)) return
  const clickedMedia =
    target.closest('zoomable-img, gallery-carousel, shreddit-player, .ire-redgifs') ||
    isMediaImage(target)
  // Crossposts: an overlay link sits over the media and gets the click first
  const crosspostMedia =
    !clickedMedia &&
    target
      .closest('[slot="post-media-container"]')
      ?.querySelector('gallery-carousel, shreddit-player, .ire-redgifs, zoomable-img')
  if (!clickedMedia && !crosspostMedia) return
  const postId =
    target.closest<HTMLElement>('article[data-post-id]')?.dataset.postId ??
    target.closest('shreddit-post[id]')?.id
  if (!postId) return
  event.preventDefault()
  event.stopPropagation()
  openViewer(postId)
}

export function initViewer() {
  document.addEventListener('click', onFeedClick, true)

  onFrameMessage((message, event) => {
    // Whenever a frame helper speaks up, tell it the current volume
    ;(event.source as Window | null)?.postMessage(volumeMessage(), { targetOrigin: event.origin })
    // A Redgifs clip clicked in the feed
    if (message.event === 'open') {
      const feedFrame = [...document.querySelectorAll('iframe')].find(
        (f) => f.contentWindow === event.source,
      )
      const postId =
        feedFrame?.closest<HTMLElement>('article[data-post-id]')?.dataset.postId ??
        feedFrame?.closest('shreddit-post[id]')?.id
      if (postId && getSettings().features.viewer) openViewer(postId)
      return
    }
    // The wheel over a Redgifs frame: next post in the viewer, else scroll
    if (message.event === 'wheel') {
      const deltaY = Number(message.deltaY) || 0
      if (state().open) wheelStep(deltaY)
      else window.scrollBy({ top: deltaY, behavior: 'instant' })
      return
    }
    if (!state().open || !frame || event.source !== frame.contentWindow) return
    // Touches on the clip, which never reach the page
    if (message.event === 'swipe') return swipe(message.axis, message.dir)
    if (message.event === 'tap') return set({ wakes: state().wakes + 1 })
    const post = currentPost()
    if (post?.type !== 'redgif') return
    if (message.event === 'audio') setHasAudio(post.id, message.hasAudio)
    if (message.event !== 'playing') return
    const length = Number(message.duration)
    if (!(length > 0 && length < 3600)) return
    // "playing" fires again on every loop, stall and HD switch; only the
    // first one marks the start, or the countdown would restart forever
    if (playStart.shownAt === shownAt) return
    clipLengths.set(post.id, Promise.resolve(length))
    playStart = { shownAt, at: Date.now() }
    if (state().slideshow) startSlideTimer(redgifSecondsLeft(length))
  })

  watchSettings((s) => s.viewer.volume, broadcastVolume)
  watchSettings((s) => s.viewer.slideSeconds, scheduleSlide)
  watchSettings(
    (s) => s.features.viewer,
    (on) => !on && closeViewer(),
  )
}
