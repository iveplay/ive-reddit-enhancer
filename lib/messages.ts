// Runtime messages between the content script and the background.

export type RuntimeMessage =
  /** Background: fetch a GIF and return the length of one play (or null) */
  | { type: 'GIF_SECONDS'; url: string }
  /** Background: fetch a GIF and return the file, base64 encoded (or null) */
  | { type: 'GIF_FILE'; url: string }

/**
 * The background reads the file: it may fetch from the media hosts listed in
 * the manifest, where a content script's fetch would be blocked by CORS.
 */
export const fetchGifSeconds = (url: string): Promise<number | null> =>
  browser.runtime
    .sendMessage({ type: 'GIF_SECONDS', url } satisfies RuntimeMessage)
    .then((seconds: unknown) => (typeof seconds === 'number' && seconds > 0 ? seconds : null))
    .catch(() => null)

export const fetchGifFile = (url: string): Promise<Uint8Array | null> =>
  browser.runtime
    .sendMessage({ type: 'GIF_FILE', url } satisfies RuntimeMessage)
    .then((base64: unknown) => {
      if (typeof base64 !== 'string') return null
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      return bytes
    })
    .catch(() => null)
