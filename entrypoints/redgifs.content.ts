import { onPageMessage, postToPage, SOUND_HASH, isRedditHost } from '@/lib/frames'
import { getSettings, loadSettings } from '@/lib/settings'

// Runs inside the Redgifs player frames that Reddit (and our viewer) embed.
// The player always starts muted and in SD and takes no option to change
// that from outside; the only way is to press its own buttons, which a script
// on reddit.com cannot reach. From in here it can.
//
// It also reports to the page what the page can't see across origins: when
// playback really starts, the clip's true length (for exact slideshow timing)
// and whether the clip has sound (for the "with sound" filter).
export default defineContentScript({
  matches: ['https://www.redgifs.com/ifr/*'],
  allFrames: true,
  runAt: 'document_idle',
  async main() {
    if (window.parent === window) return
    // Only frames embedded by Reddit; leave other sites' embeds alone
    const embedder = location.ancestorOrigins?.[0] ?? document.referrer
    if (embedder && !isRedditHost(embedder)) return

    const settings = await loadSettings()
    reportAudio()
    followPageVolume()
    reportPlayback()
    followPlayToggle()
    forwardWheel()
    forwardTouches()
    if (settings.features.redgifsHelper) pressPlayerButtons()
  },
})

// The wheel over the frame never reaches the page, so the feed wouldn't
// scroll and the viewer couldn't move on. Hand it over instead.
function forwardWheel() {
  window.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault()
      const unit = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? window.innerHeight : 1
      postToPage({ event: 'wheel', deltaY: event.deltaY * unit })
    },
    { passive: false, capture: true },
  )
}

// Redgifs' own buttons, and the control bar along the bottom, keep their
// clicks and taps
const onPlayerControl = (target: EventTarget | null, y: number) =>
  y > window.innerHeight - 48 ||
  (target instanceof Element &&
    !!target.closest('button, a[href]:not(:has(video)), input, [role="button"], [role="slider"]'))

let lastTouchAt = 0 // when a finger last left the screen

// In the viewer the clip fills the screen, so on a phone most swipes land in
// here. Hand them to the page, which moves between posts. (A tap plays/pauses
// the clip, see followPlayToggle; the viewer has a button for its controls.)
function forwardTouches() {
  if (!location.hash.includes(SOUND_HASH)) return
  // The browser doesn't scroll or zoom the frame; the swipe is ours
  document.documentElement.style.touchAction = 'none'
  let start: { x: number; y: number; at: number } | null = null
  window.addEventListener(
    'touchstart',
    (event) => {
      const touch = event.touches[0]
      start =
        event.touches.length === 1 && touch
          ? { x: touch.clientX, y: touch.clientY, at: Date.now() }
          : null
    },
    { passive: true, capture: true },
  )
  window.addEventListener(
    'touchend',
    (event) => {
      const touch = event.changedTouches[0]
      lastTouchAt = Date.now()
      if (!start || !touch || event.touches.length) return
      const dx = touch.clientX - start.x
      const dy = touch.clientY - start.y
      const elapsed = Date.now() - start.at
      const fast = elapsed < 300
      start = null
      const [axis, delta] =
        Math.abs(dy) >= Math.abs(dx) ? (['y', dy] as const) : (['x', dx] as const)
      if (Math.abs(delta) < (fast ? 30 : 60)) return
      postToPage({ event: 'swipe', axis, dir: delta < 0 ? 1 : -1 })
    },
    { passive: true, capture: true },
  )
}

// The player has no play/pause button: a click on the clip opens it on
// redgifs.com (and toggles playback on the way). Instead, a click on the clip
// opens it in our fullscreen viewer when in the feed, and plays/pauses it
// inside the viewer (the page's K key asks for the same). A Ctrl/⌘/Shift-click
// still does what Redgifs does.
function followPlayToggle() {
  const inViewer = location.hash.includes(SOUND_HASH)
  let userPaused = false

  const badge = document.createElement('div')
  badge.innerHTML =
    '<svg width="34" height="34" viewBox="0 0 24 24" fill="#fff"><path d="M6 4v16a1 1 0 0 0 1.524 .852l13 -8a1 1 0 0 0 0 -1.704l-13 -8a1 1 0 0 0 -1.524 .852z"/></svg>'
  badge.style.cssText =
    'position:fixed;top:50%;left:50%;z-index:2147483647;width:72px;height:72px;margin:-36px 0 0 -36px;display:none;place-items:center;padding-left:4px;box-sizing:border-box;border-radius:50%;background:rgba(15,15,22,.6);backdrop-filter:blur(8px);pointer-events:none;'
  const render = () => {
    badge.style.display = userPaused ? 'grid' : 'none'
    if (!badge.isConnected) document.body?.appendChild(badge)
  }

  const toggle = () => {
    const player = video()
    if (!player) return
    userPaused = !player.paused
    if (userPaused) player.pause()
    else player.play().catch(() => {})
    render()
  }

  // The player restarts the clip on its own; hold it while the user paused
  document.addEventListener(
    'play',
    (event) => userPaused && (event.target as HTMLVideoElement).pause(),
    true,
  )

  window.addEventListener(
    'click',
    (event) => {
      // Our own presses (HD, sound) aren't trusted and pass through
      if (!event.isTrusted || !video()) return
      if (event.ctrlKey || event.metaKey || event.shiftKey) return
      // In the feed with the viewer switched off: leave Redgifs' click alone
      if (!inViewer && !getSettings().features.viewer) return
      if (onPlayerControl(event.target, event.clientY)) return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (!inViewer) return postToPage({ event: 'open' })
      toggle()
      // ...and bring the viewer's controls back, as moving the mouse would. A
      // finger tap only plays/pauses; the viewer's own button shows controls.
      if (Date.now() - lastTouchAt > 800) postToPage({ event: 'tap' })
    },
    true,
  )

  onPageMessage((message) => message.event === 'toggle-play' && toggle())
}

// The clip itself: the largest video, in case the page also has small ones
const video = () =>
  [...document.querySelectorAll('video')].sort(
    (a, b) => b.offsetWidth * b.offsetHeight - a.offsetWidth * a.offsetHeight,
  )[0] ?? null

// HD once, then (only in the fullscreen viewer, marked by the hash) sound on
function pressPlayerButtons() {
  const wantSound = location.hash.includes(SOUND_HASH)
  let hdDone = false
  let soundDone = !wantSound

  function apply() {
    const player = video()
    if (!player) return
    if (!hdDone) {
      // The player starts in SD, so one press of the quality button is HD
      const quality = document.querySelector<HTMLElement>('.gifQualityButton')
      if (!quality) return
      hdDone = true
      quality.click()
      return // let the HD stream load before touching sound
    }
    if (!soundDone) {
      const sound = document.querySelector<HTMLElement>('.SoundButton[aria-label="Sound Off"]')
      if (!sound) return // not there yet, or the clip has no audio
      soundDone = true
      sound.click()
      // Browsers pause a clip that is unmuted without their blessing; if that
      // happens, go back to muted so it keeps playing
      setTimeout(() => {
        if (!player.paused) return
        document.querySelector<HTMLElement>('.SoundButton[aria-label="Sound On"]')?.click()
        player.play().catch(() => {})
      }, 500)
    }
  }

  const observer = new MutationObserver(() => {
    apply()
    if (hdDone && soundDone) observer.disconnect()
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })
  document.addEventListener('playing', apply, true)
  apply()
  // The sound button never appears for silent clips, so stop looking
  setTimeout(() => observer.disconnect(), 20_000)
}

// The Reddit page owns the volume; ask for it and keep the video at it
function followPageVolume() {
  let wanted: number | null = null
  const apply = () => {
    const player = video()
    if (player && wanted !== null) player.volume = wanted
  }
  onPageMessage((message) => {
    if (message.event !== 'volume') return
    const next = Number(message.volume)
    if (!(next >= 0 && next <= 1)) return
    wanted = next
    apply()
  })
  document.addEventListener('playing', apply, true)
  postToPage({ event: 'hello' })
}

// Has sound once the sound button shows up; doesn't if it is still missing a
// few seconds into playback
function reportAudio() {
  let reported = false
  const report = (hasAudio: boolean) => {
    if (reported) return
    reported = true
    clearInterval(poll)
    postToPage({ event: 'audio', hasAudio })
  }
  const hasButton = () => !!document.querySelector('.SoundButton')
  const poll = setInterval(() => hasButton() && report(true), 500)
  setTimeout(() => clearInterval(poll), 20_000)
  document.addEventListener('playing', () => setTimeout(() => report(hasButton()), 4000), {
    capture: true,
    once: true,
  })
}

// Each time playback (re)starts, with the true clip length
function reportPlayback() {
  document.addEventListener(
    'playing',
    (event) => {
      const duration = (event.target as HTMLVideoElement | null)?.duration
      if (duration && duration > 0) postToPage({ event: 'playing', duration })
    },
    true,
  )
}
