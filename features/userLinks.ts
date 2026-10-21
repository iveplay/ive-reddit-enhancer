import { onDomChange } from '@/lib/dom'
import { getSettings } from '@/lib/settings'

// Profile links open the user's posts (/user/x/submitted/) instead of their
// overview, which mixes in comments.
const PROFILE = /^(https?:\/\/[^/]*)?\/user\/[^/]+\/?$/

function rewriteAll() {
  if (!getSettings().features.userLinks) return
  document.querySelectorAll<HTMLAnchorElement>('a[href*="/user/"]').forEach((link) => {
    const href = link.getAttribute('href')
    if (href && PROFILE.test(href)) link.setAttribute('href', href.replace(/\/?$/, '/submitted/'))
  })
}

export function initUserLinks() {
  onDomChange(rewriteAll)
  rewriteAll()
}
