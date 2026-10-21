// Messages between the Reddit page and the Redgifs player frames (see
// entrypoints/redgifs.content.ts). Both sides are our own content scripts,
// talking through window.postMessage across the frame boundary.

export const FRAME_SOURCE = 'ive-reddit-enhancer'

/** Hash added to a viewer embed's URL: the frame helper unmutes only these */
export const SOUND_HASH = 'ire-sound'

export const REDGIFS_ORIGIN = 'https://www.redgifs.com'

/** Frame → page */
export type FrameMessage =
  | { source: typeof FRAME_SOURCE; event: 'hello' }
  /** Playback (re)started; duration is the real clip length in seconds */
  | { source: typeof FRAME_SOURCE; event: 'playing'; duration: number }
  /** Whether the clip has a sound track */
  | { source: typeof FRAME_SOURCE; event: 'audio'; hasAudio: boolean }
  /** The clip was clicked in the feed: open it in the fullscreen viewer */
  | { source: typeof FRAME_SOURCE; event: 'open' }
  /** The mouse wheel turned over the frame (pixels; the frame keeps none of it) */
  | { source: typeof FRAME_SOURCE; event: 'wheel'; deltaY: number }

/** Page → frame */
export type PageMessage =
  | { source: typeof FRAME_SOURCE; event: 'volume'; volume: number }
  /** Play the clip if paused, pause it if playing */
  | { source: typeof FRAME_SOURCE; event: 'toggle-play' }

const hostMatches = (urlOrOrigin: string, pattern: RegExp) => {
  try {
    return pattern.test(new URL(urlOrOrigin).hostname)
  } catch {
    return false
  }
}

export const isRedgifsHost = (urlOrOrigin: string) =>
  hostMatches(urlOrOrigin, /(^|\.)redgifs\.com$/)
export const isRedditHost = (urlOrOrigin: string) => hostMatches(urlOrOrigin, /(^|\.)reddit\.com$/)

const isOurs = (data: unknown): data is { source: string; event: string } =>
  typeof data === 'object' && data !== null && (data as { source?: unknown }).source === FRAME_SOURCE

/** Listen for messages from Redgifs frames (on the Reddit page) */
export function onFrameMessage(handler: (message: FrameMessage, event: MessageEvent) => void) {
  const listener = (event: MessageEvent) => {
    if (!isRedgifsHost(event.origin) || !isOurs(event.data)) return
    handler(event.data as FrameMessage, event)
  }
  window.addEventListener('message', listener)
  return () => window.removeEventListener('message', listener)
}

/** Listen for messages from the Reddit page (inside a Redgifs frame) */
export function onPageMessage(handler: (message: PageMessage) => void) {
  const listener = (event: MessageEvent) => {
    if (!isRedditHost(event.origin) || !isOurs(event.data)) return
    handler(event.data as PageMessage)
  }
  window.addEventListener('message', listener)
  return () => window.removeEventListener('message', listener)
}

/** Post to the page that embeds this frame */
export function postToPage(
  message: FrameMessage extends infer M ? (M extends FrameMessage ? Omit<M, 'source'> : never) : never,
) {
  if (window.parent === window) return
  window.parent.postMessage({ source: FRAME_SOURCE, ...message }, '*')
}
