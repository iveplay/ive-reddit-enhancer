import { useEffect, useRef, useState, type CSSProperties } from 'react'
import clsx from 'clsx'
import { IconPlayerPauseFilled, IconPlayerPlayFilled } from '@tabler/icons-react'
import { gifFrameDelays } from '@/lib/gif'
import { fetchGifFile } from '@/lib/messages'
import { onImageLoaded, togglePlay } from '@/features/viewer/controller'
import { useViewer } from '@/features/viewer/store'
import { wasTouch } from './useGestures'
import styles from './Viewer.module.scss'

// An <img> can't pause a GIF, so once the file is in, the GIF is decoded here
// and its frames drawn onto a canvas on our own clock. That makes pause hold
// the exact frame on screen, and allows a scrubber. Until then (or where the
// browser can't decode, or the file can't be read) the plain <img> plays it.

interface Decoded {
  decoder: ImageDecoder
  /** Milliseconds each frame stays up */
  delays: number[]
  total: number
}

export function GifPlayer({ src, alt, raised }: { src: string; alt: string; raised?: boolean }) {
  const paused = useViewer((s) => s.gifPaused)
  const [gif, setGif] = useState<Decoded | null>(null)
  // The controls show right away, inactive until the frames are decoded;
  // they go only when decoding is impossible
  const [failed, setFailed] = useState(typeof ImageDecoder === 'undefined')
  const [frame, setFrame] = useState(0) // for the scrubber
  const frameRef = useRef(0) // for the playback loop
  const [seeks, setSeeks] = useState(0) // redraw after a seek while paused
  const canvas = useRef<HTMLCanvasElement>(null)
  const loadedAt = useRef(0)

  // Read and decode the file
  useEffect(() => {
    if (typeof ImageDecoder === 'undefined') return
    let cancelled = false
    let decoder: ImageDecoder | undefined
    fetchGifFile(src).then(async (bytes) => {
      if (cancelled) return
      if (!bytes) return setFailed(true)
      try {
        const delays = gifFrameDelays(bytes)
        decoder = new ImageDecoder({ data: bytes, type: 'image/gif' })
        await decoder.tracks.ready
        const count = decoder.tracks.selectedTrack?.frameCount ?? 0
        if (cancelled) return
        // A still image (or a "GIF" link that serves a PNG) has nothing to scrub
        if (count < 2) return setFailed(true)
        // Trust the decoder's frame count; pad or trim our parsed delays to it
        const fitted = Array.from({ length: count }, (_, i) => delays[i] ?? 100)
        // Pick up where the <img> has got to, so the switch doesn't jump
        const total = fitted.reduce((sum, ms) => sum + ms, 0)
        let t = loadedAt.current ? (Date.now() - loadedAt.current) % total : 0
        let start = 0
        while (start < count - 1 && t >= fitted[start]!) t -= fitted[start++]!
        frameRef.current = start
        setGif({ decoder, delays: fitted, total })
      } catch {
        decoder?.close()
        if (!cancelled) setFailed(true)
      }
    })
    return () => {
      cancelled = true
      decoder?.close()
    }
  }, [src])

  // Play: draw a frame, wait its delay, move on. Paused: draw and stay.
  useEffect(() => {
    if (!gif) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const count = gif.delays.length

    const draw = async (index: number) => {
      try {
        const { image } = await gif.decoder.decode({ frameIndex: index })
        const el = canvas.current
        if (stopped || !el) return image.close()
        if (el.width !== image.displayWidth) el.width = image.displayWidth
        if (el.height !== image.displayHeight) el.height = image.displayHeight
        el.getContext('2d')?.drawImage(image, 0, 0)
        image.close()
        setFrame(index)
      } catch {}
    }

    const tick = async () => {
      const index = frameRef.current
      await draw(index)
      if (stopped || paused) return
      timer = setTimeout(() => {
        frameRef.current = (index + 1) % count
        tick()
      }, gif.delays[index])
    }
    tick()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [gif, paused, seeks])

  // Jump to a frame; scrubbing pauses, like dragging a video's timeline
  const seek = (index: number) => {
    frameRef.current = index
    setFrame(index)
    if (paused) setSeeks((n) => n + 1)
    else useViewer.setState({ gifPaused: true })
  }

  const elapsed = gif ? gif.delays.slice(0, frame).reduce((sum, ms) => sum + ms, 0) : 0
  const fill = gif ? (frame / Math.max(1, gif.delays.length - 1)) * 100 : 0

  return (
    <>
      <img
        src={src}
        alt={alt}
        className={styles.media}
        hidden={!!gif}
        onLoad={() => {
          loadedAt.current = Date.now()
          onImageLoaded(src)
        }}
        draggable={false}
      />
      {gif && (
        <canvas
          ref={canvas}
          className={clsx(styles.media, styles.clickable)}
          // A tap toggles the viewer's controls instead (see useGestures)
          onClick={() => !wasTouch() && togglePlay()}
        />
      )}
      {!failed && (
        <div
          className={clsx(
            styles.pill,
            styles.gifBar,
            raised && styles.raised,
            !gif && styles.loading,
            styles.fades,
          )}
        >
          <button
            type="button"
            className={clsx(styles.round, styles.small)}
            title={paused ? 'Play (K)' : 'Pause (K)'}
            disabled={!gif}
            onClick={togglePlay}
          >
            {paused ? <IconPlayerPlayFilled size={15} /> : <IconPlayerPauseFilled size={15} />}
          </button>
          <input
            type="range"
            min={0}
            max={gif ? gif.delays.length - 1 : 1}
            value={frame}
            disabled={!gif}
            aria-label="Position"
            style={{ '--fill': `${fill}%` } as CSSProperties}
            onChange={(e) => seek(Number(e.target.value))}
            onPointerUp={(e) => e.currentTarget.blur()}
          />
          <span className={styles.time}>
            {gif ? `${(elapsed / 1000).toFixed(1)}s / ${(gif.total / 1000).toFixed(1)}s` : 'GIF'}
          </span>
        </div>
      )}
    </>
  )
}
