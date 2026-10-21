// Reading posts out of Reddit's DOM: what media a post holds and where it
// lives. Shared by the fullscreen viewer and the media filter.
//
// Feed posts are <article data-post-id> wrapping a <shreddit-post>; a post's
// own page has a bare <shreddit-post id>. The useful data sits on attributes:
// post-type, content-href, permalink, author, subreddit-prefixed-name.

export type MediaType = 'image' | 'gif' | 'gallery' | 'video' | 'redgif'

export interface PostMeta {
  permalink: string
  author: string
  subreddit: string
  title: string
  created: Date | null
  /** Null when Reddit hides the score (new posts in some subreddits) */
  score: number | null
  comments: number | null
}

export type PostMedia =
  | { type: 'image' | 'gif' | 'video' | 'redgif'; src: string }
  | { type: 'gallery'; srcs: string[] }

export type Post = PostMedia & PostMeta & { id: string }

/** The filter's coarser view: anything that moves counts as "video" */
export type FilterKind = 'image' | 'gallery' | 'gif' | 'video'

export const isGifUrl =(src: string) => /\.gif\b|format=gif/i.test(src)

// Images that are part of the post's chrome, not its content
const isDecoration = (img: Element) =>
  img.getAttribute('role') === 'presentation' ||
  !!img.closest('[avatar], faceplate-hovercard') ||
  img.classList.contains('shreddit-subreddit-icon__icon')

export const isMediaImage = (el: Element) => el.tagName === 'IMG' && !isDecoration(el)

/** Largest candidate from srcset, else the plain src */
export function bestSrc(img: Element): string | null {
  const srcset = img.getAttribute('srcset') ?? img.getAttribute('data-lazy-srcset')
  if (srcset) {
    const best = srcset
      .split(',')
      .map((entry) => {
        const [url, width] = entry.trim().split(/\s+/)
        return { url, width: parseInt(width ?? '') || 0 }
      })
      .sort((a, b) => b.width - a.width)[0]
    if (best?.url) return best.url
  }
  const src = (img as HTMLImageElement).src || img.getAttribute('data-lazy-src')
  if (src && !src.startsWith('data:') && src !== location.href) return src
  return null
}

function gallerySrcs(carousel: Element): string[] {
  const srcs: string[] = []
  carousel.querySelectorAll('li').forEach((li) => {
    for (const img of li.querySelectorAll('img')) {
      if (img.getAttribute('role') === 'presentation') continue
      const src = bestSrc(img)
      if (src && !srcs.includes(src)) {
        srcs.push(src)
        break
      }
    }
  })
  return srcs
}

// Reddit serves video as HLS (.m3u8), which a plain <video> can't play in
// Chrome or Firefox. The player element also carries direct, muxed MP4 URLs in
// its packaged-media-json attribute; take the highest resolution one.
function packagedMp4(player: Element): string | null {
  try {
    const permutations: { source?: { url?: string; dimensions?: { height?: number } } }[] =
      JSON.parse(player.getAttribute('packaged-media-json') ?? '')?.playbackMp4s?.permutations ?? []
    const best = permutations
      .map((p) => p.source)
      .filter((s) => s?.url)
      .sort((a, b) => (b?.dimensions?.height ?? 0) - (a?.dimensions?.height ?? 0))[0]
    return best?.url ?? null
  } catch {
    return null
  }
}

const numberAttr = (post: Element | null, name: string) => {
  const value = post?.getAttribute(name)
  const n = value ? Number(value) : NaN
  return Number.isFinite(n) ? n : null
}

export function postMeta(post: Element | null): PostMeta {
  const created = new Date(post?.getAttribute('created-timestamp') ?? '')
  return {
    permalink: post?.getAttribute('permalink') ?? '',
    author: post?.getAttribute('author') ?? '',
    subreddit: post?.getAttribute('subreddit-prefixed-name') ?? '',
    title: post?.getAttribute('post-title') ?? '',
    created: Number.isNaN(created.getTime()) ? null : created,
    score: numberAttr(post, 'score'),
    comments: numberAttr(post, 'comment-count'),
  }
}

/** What the viewer can show for a post, if anything */
export function extractMedia(container: Element, post: Element | null): PostMedia | null {
  const postType = post?.getAttribute('post-type')
  // A crosspost's type says nothing about its media; look at everything
  const type = postType === 'crosspost' ? null : postType

  if (type === 'gallery' || !type) {
    const carousel = container.querySelector('gallery-carousel')
    const srcs = carousel ? gallerySrcs(carousel) : []
    if (srcs.length) return { type: 'gallery', srcs }
  }

  const redgifs = container.querySelector<HTMLElement>('.ire-redgifs')
  if (redgifs?.dataset.redgifsSrc) return { type: 'redgif', src: redgifs.dataset.redgifsSrc }
  const redgifsFrame = container.querySelector<HTMLIFrameElement>('iframe[src*="redgifs.com"]')
  if (redgifsFrame) return { type: 'redgif', src: redgifsFrame.src }

  const player = container.querySelector('shreddit-player')
  if (player) {
    const src =
      packagedMp4(player) ||
      player.querySelector('video')?.src ||
      player.getAttribute('src') ||
      player.querySelector('source')?.getAttribute('src')
    if (src) return { type: 'video', src }
  }

  if (type === 'image' || type === 'link' || !type) {
    const image = (src: string): PostMedia => ({ type: isGifUrl(src) ? 'gif' : 'image', src })
    const zoomable = container.querySelector('zoomable-img img')
    const zoomableSrc = zoomable && bestSrc(zoomable)
    if (zoomableSrc) return image(zoomableSrc)
    const href = post?.getAttribute('content-href')
    if (href && /\.(jpe?g|png|gif|webp)(\?|$)/i.test(href)) return image(href)
    for (const img of container.querySelectorAll('img')) {
      if (isDecoration(img)) continue
      const src = bestSrc(img)
      if (src) return image(src)
    }
  }
  return null
}

/** Buckets for the media filter; null for text and link posts */
export function classify(article: Element): FilterKind | null {
  const post = article.querySelector('shreddit-post')
  if (!post) return null
  const type = post.getAttribute('post-type')
  const href = post.getAttribute('content-href') ?? ''
  if (
    type === 'video' ||
    article.querySelector(
      'shreddit-player, shreddit-embed, .ire-redgifs, iframe[src*="redgifs.com"]',
    ) ||
    /\.(gifv?|mp4|webm)(\?|$)|redgifs\.com|gfycat\.com/i.test(href)
  )
    return 'video'
  const img = article.querySelector<HTMLImageElement>('zoomable-img img')
  if (img && isGifUrl(`${img.src} ${img.getAttribute('srcset') ?? ''}`)) return 'gif'
  if (type === 'gallery' || article.querySelector('gallery-carousel')) return 'gallery'
  if (type === 'image' || img) return 'image'
  return null
}

export const isPromoted = (article: Element) => !!article.querySelector('shreddit-ad-post')

export const feedArticles = () =>
  document.querySelectorAll<HTMLElement>('shreddit-feed article[data-post-id]')

export const findArticle = (postId: string) =>
  document.querySelector<HTMLElement>(`article[data-post-id="${CSS.escape(postId)}"]`)
