import { onDomChange } from '@/lib/dom'

// Reddit's <shreddit-embed> for Redgifs shows nothing useful. Swap it for a
// plain iframe of the Redgifs player, loaded only while at least half of it is
// on screen so a long feed doesn't play fifty clips at once.

const lazyLoad = new IntersectionObserver(
  (entries) => {
    for (const { target, intersectionRatio } of entries) {
      const wrapper = target as HTMLElement
      const iframe = wrapper.querySelector('iframe')
      if (!iframe) continue
      if (intersectionRatio >= 0.5) {
        if (!iframe.src) iframe.src = wrapper.dataset.redgifsSrc!
      } else if (iframe.src) {
        iframe.removeAttribute('src')
      }
    }
  },
  { threshold: [0, 0.5] },
)

function fixEmbed(embed: Element) {
  if (embed.hasAttribute('data-ire-fixed')) return
  const match = embed.getAttribute('html')?.match(/redgifs\.com\/ifr\/([^"]+)/)
  if (!match) return
  embed.setAttribute('data-ire-fixed', '')
  const src = `https://www.redgifs.com/ifr/${match[1]}`

  const wrapper = document.createElement('div')
  wrapper.className = 'ire-redgifs'
  wrapper.dataset.redgifsSrc = src

  const iframe = document.createElement('iframe')
  iframe.className = 'ire-redgifs-frame'
  iframe.allow = 'autoplay; fullscreen'
  iframe.setAttribute('allowfullscreen', '')
  iframe.setAttribute('scrolling', 'no')

  // A click on the frame lands inside Redgifs' player, which opens the clip on
  // redgifs.com. This see-through cover catches it on our side instead, so it
  // opens the fullscreen viewer like any other post. The bottom strip stays
  // uncovered for the player's own controls.
  const shield = document.createElement('div')
  shield.className = 'ire-redgifs-shield'

  wrapper.append(iframe, shield)
  const container = embed.closest('shreddit-aspect-ratio') ?? embed.parentElement
  if (!container) return
  container.appendChild(wrapper)
  embed.removeAttribute('html')
  embed.remove()
  lazyLoad.observe(wrapper)
}

function fixAll() {
  document.querySelectorAll('shreddit-embed:not([data-ire-fixed])').forEach(fixEmbed)
}

export function initRedgifsEmbeds() {
  onDomChange(fixAll)
  // Reddit sometimes fills in an embed's html attribute after adding it
  setInterval(fixAll, 2000)
  fixAll()
}
