import { gifSeconds } from '@/lib/gif'
import type { RuntimeMessage } from '@/lib/messages'

// Hosts the GIF reader may fetch from; the manifest grants exactly these
const GIF_HOSTS = /(^|\.)(reddit\.com|redd\.it|redgifs\.com|imgur\.com)$/

const isAllowed = (raw: string) => {
  try {
    const url = new URL(raw)
    return /^https?:$/.test(url.protocol) && GIF_HOSTS.test(url.hostname)
  } catch {
    return false
  }
}

// Messages are JSON, so file contents travel as base64
function toBase64(bytes: Uint8Array) {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

export default defineBackground(() => {
  // Recently read files (the viewer asks for the same GIF for its length and
  // for its frames), and lengths for the whole session
  const files = new Map<string, Promise<Uint8Array | null>>()
  const lengths = new Map<string, Promise<number | null>>()

  const readFile = (url: string) => {
    let file = files.get(url)
    if (!file) {
      file = fetch(url)
        .then((response) => (response.ok ? response.arrayBuffer() : null))
        .then((buffer) => (buffer ? new Uint8Array(buffer) : null))
        .catch(() => null)
      files.set(url, file)
      if (files.size > 10) files.delete(files.keys().next().value!)
    }
    return file
  }

  const readLength = (url: string) => {
    let length = lengths.get(url)
    if (!length) {
      length = readFile(url).then((bytes) => (bytes ? gifSeconds(bytes) : null))
      lengths.set(url, length)
      if (lengths.size > 200) lengths.delete(lengths.keys().next().value!)
    }
    return length
  }

  browser.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
    // Only our own content scripts and pages
    if (sender.id !== browser.runtime.id) return
    if (message.type === 'GIF_SECONDS') {
      if (!isAllowed(message.url)) return sendResponse(null)
      readLength(message.url).then(sendResponse)
      return true
    }
    if (message.type === 'GIF_FILE') {
      if (!isAllowed(message.url)) return sendResponse(null)
      readFile(message.url).then((bytes) => sendResponse(bytes ? toBase64(bytes) : null))
      return true
    }
  })
})
