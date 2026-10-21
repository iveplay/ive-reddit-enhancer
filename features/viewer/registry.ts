import { onDomChange, pageKey } from '@/lib/dom'
import { extractMedia, isPromoted, postMeta, type Post } from '../posts'
import { useViewer } from './store'

// Every media post seen on the current page, in feed order. Reddit
// virtualizes the feed (posts far off screen are swapped for empty
// placeholders), so the viewer can't rely on the DOM; this list remembers
// them. Starts over when Reddit navigates to another page.

const posts = new Map<string, Post>()
const order: string[] = []
let lastPage = pageKey()

const add = (post: Post) => {
  posts.set(post.id, post)
  order.push(post.id)
}

function registerArticle(article: HTMLElement) {
  const id = article.dataset.postId
  if (!id || posts.has(id) || isPromoted(article)) return
  const shredditPost = article.querySelector('shreddit-post')
  const media = extractMedia(article, shredditPost)
  if (media) add({ id, ...media, ...postMeta(shredditPost) })
}

export function scanPosts() {
  const page = pageKey()
  // Never while the viewer is open: it is walking through this list
  if (page !== lastPage && !useViewer.getState().open) {
    lastPage = page
    posts.clear()
    order.length = 0
  }
  document.querySelectorAll<HTMLElement>('article[data-post-id]').forEach(registerArticle)
  // A post's own page: a bare <shreddit-post> outside any article
  document.querySelectorAll('shreddit-post[id]').forEach((post) => {
    const id = post.id
    if (posts.has(id) || post.closest('article[data-post-id]')) return
    const media = extractMedia(post.closest('main') ?? post.parentElement ?? post, post)
    if (media) add({ id, ...media, ...postMeta(post) })
  })
  if (useViewer.getState().count !== order.length) useViewer.setState({ count: order.length })
}

export const postAt = (index: number): Post | undefined => posts.get(order[index] ?? '')
export const indexOfPost = (id: string) => order.indexOf(id)
export const postCount = () => order.length

export function initRegistry() {
  onDomChange(scanPosts)
  scanPosts()
}
