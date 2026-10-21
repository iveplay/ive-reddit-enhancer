import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import clsx from 'clsx'
import {
  IconArrowBigUp,
  IconClock,
  IconMessageCircle,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
  IconExternalLink,
  IconKeyboard,
  IconMinus,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconPlus,
  IconUser,
  IconUsersGroup,
  IconVolume,
  IconVolume2,
  IconVolumeOff,
  IconX,
} from '@tabler/icons-react'
import { compactNumber, fullDate, timeAgo } from '@/lib/format'
import { SOUND_HASH } from '@/lib/frames'
import { useSettings } from '@/lib/settings'
import {
  changeSlideSpeed,
  closeViewer,
  currentPost,
  moveGallery,
  onImageLoaded,
  onVideoEnded,
  setViewerFrame,
  setViewerVideo,
  setVolume,
  step,
  toggleMute,
  toggleSlideshow,
} from '@/features/viewer/controller'
import { useViewer } from '@/features/viewer/store'
import { isGifUrl, type Post } from '@/features/posts'
import { GifPlayer } from './GifPlayer'
import styles from './Viewer.module.scss'

const IDLE_MS = 2500

export function Viewer() {
  const open = useViewer((s) => s.open)
  return open ? <Overlay /> : null
}

function Overlay() {
  const index = useViewer((s) => s.index)
  const galleryIndex = useViewer((s) => s.galleryIndex)
  const progress = useViewer((s) => s.progress)
  const post = currentPost()
  const [idle, setIdle] = useState(false)
  const [help, setHelp] = useState(false)

  // Controls fade out while the mouse rests, and come back when it moves
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const wake = () => {
      setIdle(false)
      clearTimeout(timer)
      timer = setTimeout(() => setIdle(true), IDLE_MS)
    }
    wake()
    window.addEventListener('mousemove', wake)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('mousemove', wake)
    }
  }, [])

  if (!post) return null

  return (
    <div className={clsx(styles.overlay, idle && !help && styles.idle)}>
      {progress.seconds > 0 && (
        <div
          key={progress.key}
          className={styles.progress}
          style={{ '--seconds': `${progress.seconds}s` } as CSSProperties}
        />
      )}

      <div
        className={styles.stage}
        onClick={(e) => e.target === e.currentTarget && closeViewer()}
      >
        <Media post={post} galleryIndex={galleryIndex} />
      </div>

      <header className={clsx(styles.top, styles.fades)}>
        <Counter index={index} />
        <div className={styles.spacer} />
        <VolumeControl />
        <SlideshowControl />
        <RoundButton
          tip="Keyboard shortcuts"
          active={help}
          onClick={() => setHelp((h) => !h)}
        >
          <IconKeyboard size={18} stroke={1.8} />
        </RoundButton>
        <RoundButton tip="Close (Esc)" onClick={closeViewer}>
          <IconX size={20} stroke={1.8} />
        </RoundButton>
      </header>

      {help && <Shortcuts onClose={() => setHelp(false)} />}

      {post.type === 'gallery' && <GalleryNav count={post.srcs.length} index={galleryIndex} />}

      <footer className={styles.bottom}>
        <PostInfo post={post} />
        <nav className={styles.postNav}>
          <RoundButton tip="Previous post (↑)" small onClick={() => step(-1)}>
            <IconChevronUp size={20} stroke={1.8} />
          </RoundButton>
          <RoundButton tip="Next post (↓)" small onClick={() => step(1)}>
            <IconChevronDown size={20} stroke={1.8} />
          </RoundButton>
        </nav>
      </footer>
    </div>
  )
}

function Media({ post, galleryIndex }: { post: Post; galleryIndex: number }) {
  if (post.type === 'video') return <Video src={post.src} />
  if (post.type === 'redgif') return <Redgif src={post.src} />
  const src = post.type === 'gallery' ? post.srcs[galleryIndex] : post.src
  if (!src) return null
  if (isGifUrl(src))
    return <GifPlayer key={src} src={src} alt={post.title} raised={post.type === 'gallery'} />
  return (
    <img
      key={src}
      src={src}
      alt={post.title}
      className={styles.media}
      onLoad={() => onImageLoaded(src)}
      draggable={false}
    />
  )
}

function Video({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  const volume = useSettings((s) => s.settings.viewer.volume)
  const slideshow = useViewer((s) => s.slideshow)

  useEffect(() => {
    const video = ref.current
    setViewerVideo(video)
    // Opening the viewer is a user gesture, so try with sound; if the
    // browser's autoplay policy says no, play muted instead
    video?.play().catch(() => {
      video.muted = true
      video.play().catch(() => {})
    })
    return () => setViewerVideo(null)
  }, [src])

  useEffect(() => {
    const video = ref.current
    if (!video) return
    video.volume = volume
    video.muted = volume === 0
  }, [volume, src])

  return (
    <video
      key={src}
      ref={ref}
      src={src}
      className={styles.media}
      controls
      playsInline
      loop={!slideshow}
      onEnded={(e) => onVideoEnded(e.currentTarget)}
    />
  )
}

function Redgif({ src }: { src: string }) {
  const ref = useRef<HTMLIFrameElement>(null)
  useEffect(() => {
    setViewerFrame(ref.current)
    return () => setViewerFrame(null)
  }, [src])
  // The frame helper turns clicks on the clip into play/pause, and hands the
  // wheel back to us for moving between posts
  return (
    <iframe
      key={src}
      ref={ref}
      // The hash tells the frame helper to unmute this one
      src={`${src.split('#')[0]}#${SOUND_HASH}`}
      className={styles.frame}
      allow="autoplay; fullscreen"
      allowFullScreen
    />
  )
}

function Counter({ index }: { index: number }) {
  const count = useViewer((s) => s.count)
  return (
    <div className={clsx(styles.pill, styles.counter)}>
      <span className={styles.strong}>{index + 1}</span>
      <span className={styles.dim}>/ {count}</span>
    </div>
  )
}

function VolumeControl() {
  const volume = useSettings((s) => s.settings.viewer.volume)
  const Icon = volume === 0 ? IconVolumeOff : volume < 0.5 ? IconVolume2 : IconVolume
  const percent = Math.round(volume * 100)
  return (
    <div className={clsx(styles.pill, styles.volume)}>
      <RoundButton tip={volume > 0 ? 'Mute (M)' : 'Unmute (M)'} small onClick={toggleMute}>
        <Icon size={18} stroke={1.8} />
      </RoundButton>
      <input
        type="range"
        min={0}
        max={100}
        value={percent}
        aria-label="Volume"
        style={{ '--fill': `${percent}%` } as CSSProperties}
        onChange={(e) => setVolume(Number(e.target.value) / 100)}
        // Hand the arrow keys back to the viewer once the drag is done
        onPointerUp={(e) => e.currentTarget.blur()}
      />
    </div>
  )
}

function SlideshowControl() {
  const slideshow = useViewer((s) => s.slideshow)
  const seconds = useSettings((s) => s.settings.viewer.slideSeconds)
  return (
    <div className={styles.pill}>
      <RoundButton tip="Faster (−)" small onClick={() => changeSlideSpeed(-1)}>
        <IconMinus size={15} stroke={2} />
      </RoundButton>
      <span className={styles.seconds} title="Seconds per post">
        {seconds}s
      </span>
      <RoundButton tip="Slower (+)" small onClick={() => changeSlideSpeed(1)}>
        <IconPlus size={15} stroke={2} />
      </RoundButton>
      <button
        type="button"
        className={clsx(styles.play, slideshow && styles.playing)}
        title={slideshow ? 'Pause slideshow (Space)' : 'Start slideshow (Space)'}
        onClick={toggleSlideshow}
      >
        {slideshow ? <IconPlayerPauseFilled size={15} /> : <IconPlayerPlayFilled size={15} />}
      </button>
    </div>
  )
}

function GalleryNav({ count, index }: { count: number; index: number }) {
  return (
    <>
      {index > 0 && (
        <RoundButton
          tip="Previous image (←)"
          large
          className={clsx(styles.galleryArrow, styles.left, styles.fades)}
          onClick={() => moveGallery(-1)}
        >
          <IconChevronLeft size={26} stroke={1.8} />
        </RoundButton>
      )}
      {index < count - 1 && (
        <RoundButton
          tip="Next image (→)"
          large
          className={clsx(styles.galleryArrow, styles.right, styles.fades)}
          onClick={() => moveGallery(1)}
        >
          <IconChevronRight size={26} stroke={1.8} />
        </RoundButton>
      )}
      <div className={clsx(styles.pill, styles.galleryCount)}>
        {count <= 12 ? (
          Array.from({ length: count }, (_, i) => (
            <i key={i} className={clsx(styles.dot, i === index && styles.current)} />
          ))
        ) : (
          <span>
            {index + 1} / {count}
          </span>
        )}
      </div>
    </>
  )
}

// Profile posts report their "subreddit" as u_name
const communityLink = (name: string) => {
  const user = name.match(/^u[_/](.+)$/)
  return user
    ? { label: `u/${user[1]}`, href: `/user/${user[1]}/submitted/` }
    : { label: name, href: `/${name}/` }
}

function PostInfo({ post }: { post: Post }) {
  const community = post.subreddit ? communityLink(post.subreddit) : null
  const showAuthor =
    post.author && post.author !== '[deleted]' && post.subreddit !== `u_${post.author}`
  return (
    <>
      <div className={styles.info}>
        <p className={styles.title} title={post.title}>
          {post.title}
        </p>
        <PostStats post={post} />
      </div>
      <div className={styles.links}>
        {community && (
          <Chip href={community.href}>
            <IconUsersGroup size={14} stroke={1.8} />
            {community.label}
          </Chip>
        )}
        {showAuthor && (
          <Chip href={`/user/${post.author}/submitted/`}>
            <IconUser size={14} stroke={1.8} />
            u/{post.author}
          </Chip>
        )}
        {post.type === 'redgif' && (
          <Chip href={post.src.replace(/#.*$/, '').replace('/ifr/', '/watch/')}>
            Redgifs
            <IconExternalLink size={14} stroke={1.8} />
          </Chip>
        )}
        {post.permalink && (
          <Chip href={post.permalink} brand>
            Open post
            <IconExternalLink size={14} stroke={1.8} />
          </Chip>
        )}
      </div>
    </>
  )
}

// When it was posted, its score and comment count
function PostStats({ post }: { post: Post }) {
  const comments = post.permalink ? `${post.permalink.replace(/\/?$/, '/')}#comments` : null
  return (
    <p className={styles.stats}>
      {post.created && (
        <span title={fullDate(post.created)}>
          <IconClock size={13} stroke={1.8} />
          {timeAgo(post.created)} ago
        </span>
      )}
      {post.score !== null && (
        <span title={`${post.score.toLocaleString()} points`}>
          <IconArrowBigUp size={14} stroke={1.8} />
          {compactNumber(post.score)}
        </span>
      )}
      {post.comments !== null && comments && (
        <a href={comments} target="_blank" title={`${post.comments.toLocaleString()} comments`}>
          <IconMessageCircle size={13} stroke={1.8} />
          {compactNumber(post.comments)}
        </a>
      )}
    </p>
  )
}

function Chip({ href, brand, children }: { href: string; brand?: boolean; children: ReactNode }) {
  return (
    <a href={href} target="_blank" className={clsx(styles.chip, brand && styles.brandChip)}>
      {children}
    </a>
  )
}

function RoundButton({
  tip,
  small,
  large,
  active,
  className,
  onClick,
  children,
}: {
  tip: string
  small?: boolean
  large?: boolean
  active?: boolean
  className?: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={tip}
      aria-label={tip}
      className={clsx(
        styles.round,
        small && styles.small,
        large && styles.large,
        active && styles.active,
        className,
      )}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      {children}
    </button>
  )
}

const SHORTCUTS: [string[], string][] = [
  [['↑', '↓'], 'Previous / next post'],
  [['←', '→'], 'Previous / next image in a gallery'],
  [['Wheel'], 'Previous / next image, then post'],
  [['Space'], 'Start / pause slideshow'],
  [['K'], 'Play / pause a video or GIF'],
  [['−', '+'], 'Slideshow faster / slower'],
  [['M'], 'Mute / unmute'],
  [['Esc'], 'Close the viewer'],
]

function Shortcuts({ onClose }: { onClose: () => void }) {
  return (
    <div className={styles.shortcuts} onClick={onClose}>
      <p className={styles.shortcutsTitle}>Keyboard shortcuts</p>
      {SHORTCUTS.map(([keys, label]) => (
        <div key={label} className={styles.shortcut}>
          <span className={styles.keys}>
            {keys.map((key) => (
              <kbd key={key}>{key}</kbd>
            ))}
          </span>
          <span>{label}</span>
        </div>
      ))}
    </div>
  )
}
