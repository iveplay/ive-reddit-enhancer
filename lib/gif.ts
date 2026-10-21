/**
 * Length of one play of a GIF file in seconds, from adding up the delay of
 * every frame. Null for a still image or a file that isn't a GIF.
 */
export function gifSeconds(buffer: ArrayBuffer | Uint8Array): number | null {
  const delays = gifFrameDelays(buffer)
  return delays.length > 1 ? delays.reduce((sum, ms) => sum + ms, 0) / 1000 : null
}

/** How long each frame of a GIF stays up, in milliseconds (empty if not a GIF) */
export function gifFrameDelays(buffer: ArrayBuffer | Uint8Array): number[] {
  const b = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  const delays: number[] = []
  const at = (i: number) => b[i] ?? 0
  if (b.length < 13 || String.fromCharCode(at(0), at(1), at(2)) !== 'GIF') return delays
  const tableSize = (flags: number) => (flags & 0x80 ? 3 << ((flags & 7) + 1) : 0)
  let i = 13 + tableSize(at(10))
  const skipBlocks = () => {
    while (i < b.length && at(i)) i += at(i) + 1
    i++
  }
  let delay = 0
  while (i < b.length) {
    const kind = at(i++)
    if (kind === 0x21) {
      // Extension; the graphic control one carries the next frame's delay
      if (at(i++) === 0xf9) delay = at(i + 2) | (at(i + 3) << 8)
      skipBlocks()
    } else if (kind === 0x2c) {
      // Image: descriptor, optional colour table, code size, pixel data
      i += 9
      i += tableSize(at(i - 1)) + 1
      skipBlocks()
      // Browsers play delays under 20ms as 100ms
      delays.push(delay < 2 ? 100 : delay * 10)
      delay = 0
    } else break
  }
  return delays
}
