import { create } from 'zustand'
import { onDomChange } from '@/lib/dom'
import { onFrameMessage } from '@/lib/frames'
import { getSettings, watchSettings, type MediaFilter } from '@/lib/settings'
import { classify, feedArticles, type FilterKind, type MediaType } from './posts'

// Show only photos, only moving media, or only clips with sound. Feed posts
// that don't pass get .ire-filtered-out (hidden by styles/page.scss); text
// and link posts are hidden under any filter. The viewer skips them too.

const ALLOWED: Record<Exclude<MediaFilter, 'all'>, (FilterKind | MediaType)[]> = {
  photos: ['image', 'gallery'],
  moving: ['gif', 'video', 'redgif'],
  sound: ['video', 'redgif'],
}

export const activeFilter = (): MediaFilter => getSettings().mediaFilter

// postId -> whether the clip has sound, once known. Clips not checked yet
// stay visible, so they get the chance to be checked.
const hasAudio = new Map<string, boolean>()

/** Counts for the dock badge: how many feed posts the filter hides */
export const useFilterStats = create<{ hidden: number; checking: boolean }>()(() => ({
  hidden: 0,
  checking: false,
}))

export function passesMediaFilter(type: FilterKind | MediaType | null, postId: string) {
  const filter = activeFilter()
  if (filter === 'all') return true
  if (!type || !ALLOWED[filter].includes(type)) return false
  return filter !== 'sound' || hasAudio.get(postId) !== false
}

export function setHasAudio(postId: string, value: boolean) {
  if (hasAudio.get(postId) === value) return
  hasAudio.set(postId, value)
  syncFeed()
}

function syncFeed() {
  let hidden = 0
  feedArticles().forEach((article) => {
    const out = !passesMediaFilter(classify(article), article.dataset.postId ?? '')
    article.classList.toggle('ire-filtered-out', out)
    if (out) hidden++
  })
  if (useFilterStats.getState().hidden !== hidden) useFilterStats.setState({ hidden })
  if (activeFilter() === 'sound') queueAudioCheck()
}

// Reddit's own post data says whether a Reddit-hosted video has sound, up to
// 100 posts per request. Redgifs are reported by the frame helper instead.
const audioAsked = new Set<string>() // asked once only, whatever the answer
let audioTimer: ReturnType<typeof setTimeout> | null = null
let pending = 0

function queueAudioCheck() {
  if (audioTimer) return
  audioTimer = setTimeout(() => {
    audioTimer = null
    const ids: string[] = []
    feedArticles().forEach((article) => {
      const id = article.dataset.postId ?? ''
      if (
        /^t3_\w+$/.test(id) &&
        !hasAudio.has(id) &&
        !audioAsked.has(id) &&
        classify(article) === 'video'
      )
        ids.push(id)
    })
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100)
      batch.forEach((id) => audioAsked.add(id))
      pending++
      useFilterStats.setState({ checking: true })
      fetch(`/by_id/${batch.join(',')}.json?raw_json=1`, { credentials: 'include' })
        .then((response) => (response.ok ? response.json() : null))
        .then((json) => {
          json?.data?.children?.forEach(({ data }: { data: RedditPostData }) => {
            const audio = audioFromPostData(data)
            if (audio !== null && data.name) hasAudio.set(data.name, audio)
          })
        })
        .catch(() => {})
        .finally(() => {
          pending--
          useFilterStats.setState({ checking: pending > 0 })
          syncFeed()
        })
    }
  }, 300)
}

interface RedditPostData {
  name?: string
  secure_media?: RedditMedia
  media?: RedditMedia
  crosspost_parent_list?: RedditPostData[]
}
interface RedditMedia {
  reddit_video?: { has_audio?: boolean }
  oembed?: { provider_name?: string }
}

// true / false for Reddit videos and YouTube-style embeds; null when the data
// doesn't say
function audioFromPostData(data: RedditPostData): boolean | null {
  // A crosspost keeps its media details on the original post
  for (const item of [data, ...(data.crosspost_parent_list ?? [])]) {
    const video = item.secure_media?.reddit_video ?? item.media?.reddit_video
    if (typeof video?.has_audio === 'boolean') return video.has_audio
    const provider = (item.secure_media?.oembed ?? item.media?.oembed)?.provider_name ?? ''
    if (/youtube|vimeo|streamable|twitch/i.test(provider)) return true
  }
  return null
}

export function initMediaFilter() {
  // Redgifs in the feed: the frame helper says whether the clip has sound.
  // (The viewer reports its own frame.)
  onFrameMessage((message, event) => {
    if (message.event !== 'audio' || typeof message.hasAudio !== 'boolean') return
    const frame = [...document.querySelectorAll('iframe')].find(
      (f) => f.contentWindow === event.source,
    )
    const postId = frame?.closest<HTMLElement>('article[data-post-id]')?.dataset.postId
    if (postId) setHasAudio(postId, message.hasAudio)
  })
  watchSettings(activeFilter, syncFeed)
  onDomChange(syncFeed)
  syncFeed()
}
