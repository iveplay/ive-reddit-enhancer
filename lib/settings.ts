import { create } from 'zustand'

// Every option the extension has, in one object saved under one key in the
// extension's own storage. That storage is shared by the content script, the
// popup and the options page, and the page itself can't read it.
// Changing a value anywhere reaches every open Reddit tab straight away.

export type MediaFilter = 'all' | 'photos' | 'moving' | 'sound'
export type DockSide = 'right' | 'left'

export interface Settings {
  /** Features that can be switched off in the popup; the rest are always on */
  features: {
    /** Right sidebar collapses to a rail, slides in on hover */
    rightSidebar: boolean
    /** Remember Reddit's own left sidebar open/closed state */
    leftSidebarMemory: boolean
    /** Click media to open the fullscreen viewer */
    viewer: boolean
    /** /user/x links go to /user/x/submitted/ */
    userLinks: boolean
    hidePromoted: boolean
    /** Inside Redgifs frames: switch to HD, unmute in the viewer */
    redgifsHelper: boolean
    /** Redgifs clips in the feed play on their own; off = only while hovered */
    redgifsAutoplay: boolean
  }
  /** `narrowCols` applies on phone-sized screens, `cols` everywhere else */
  grid: { on: boolean; cols: number; narrowCols: number; compact: boolean }
  viewer: {
    slideSeconds: number
    volume: number
    preload: boolean
    /** Wheel and slideshow go through a gallery's images; off = straight to the next post */
    throughGalleries: boolean
  }
  autoScroll: { level: number }
  mediaFilter: MediaFilter
  rightSidebarPinned: boolean
  /** Reddit's left sidebar, as last set by the user; null = never touched */
  leftSidebarExpanded: boolean | null
  dock: { side: DockSide }
}

export const DEFAULT_SETTINGS: Settings = {
  features: {
    rightSidebar: true,
    leftSidebarMemory: true,
    viewer: true,
    userLinks: true,
    hidePromoted: true,
    redgifsHelper: true,
    redgifsAutoplay: true,
  },
  grid: { on: false, cols: 3, narrowCols: 1, compact: false },
  viewer: { slideSeconds: 5, volume: 1, preload: true, throughGalleries: true },
  autoScroll: { level: 3 },
  mediaFilter: 'all',
  rightSidebarPinned: false,
  leftSidebarExpanded: null,
  dock: { side: 'right' },
}

export const GRID_COLS = { min: 2, max: 6 }
export const GRID_COLS_NARROW = { min: 1, max: 4 }
export const SLIDE_SPEEDS = [1, 2, 3, 4, 5, 7, 10, 15, 20, 30] // seconds per post
export const SCROLL_SPEEDS = [20, 40, 70, 110, 170, 260, 400, 600] // pixels per second

const STORAGE_KEY = 'settings'

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] }
export type SettingsPatch = DeepPartial<Settings>

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// Lay `patch` over `base`, one level of nesting at a time. Keys the base
// doesn't have are dropped, so stale keys from older versions fall away.
function merge<T>(base: T, patch: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) return base
  const out: Record<string, unknown> = { ...base }
  for (const key of Object.keys(base)) {
    if (!(key in patch)) continue
    const next = patch[key]
    const current = (base as Record<string, unknown>)[key]
    if (isPlainObject(current)) out[key] = merge(current, next)
    else if (current === null || next === null || typeof next === typeof current) out[key] = next
  }
  return out as T
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

// Whatever is stored, hand back something every feature can rely on
function sanitize(raw: unknown): Settings {
  const s = merge(DEFAULT_SETTINGS, raw)
  s.grid.cols = clamp(Math.round(s.grid.cols) || 3, GRID_COLS.min, GRID_COLS.max)
  s.grid.narrowCols = clamp(
    Math.round(s.grid.narrowCols) || 1,
    GRID_COLS_NARROW.min,
    GRID_COLS_NARROW.max,
  )
  s.viewer.volume = clamp(Number.isFinite(s.viewer.volume) ? s.viewer.volume : 1, 0, 1)
  if (!(s.viewer.slideSeconds > 0)) s.viewer.slideSeconds = DEFAULT_SETTINGS.viewer.slideSeconds
  s.autoScroll.level = clamp(Math.round(s.autoScroll.level) || 0, 0, SCROLL_SPEEDS.length - 1)
  if (!['all', 'photos', 'moving', 'sound'].includes(s.mediaFilter)) s.mediaFilter = 'all'
  if (s.dock.side !== 'left') s.dock.side = 'right'
  return s
}

// What this context saved lately. storage.onChanged echoes our own writes
// back, and while a value is being dragged (the volume slider) older echoes
// arrive after newer writes; applying them would make the value jump back.
const recentWrites: string[] = []
function save(settings: Settings) {
  recentWrites.push(JSON.stringify(settings))
  if (recentWrites.length > 30) recentWrites.shift()
  browser.storage.local.set({ [STORAGE_KEY]: settings }).catch(() => {})
}

interface SettingsStore {
  settings: Settings
  /** True once the stored settings have been read */
  loaded: boolean
  update: (patch: SettingsPatch) => void
  reset: () => void
}

export const useSettings = create<SettingsStore>()((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  update: (patch) => {
    const settings = sanitize(merge(get().settings, patch))
    set({ settings })
    save(settings)
  },
  reset: () => {
    set({ settings: DEFAULT_SETTINGS })
    save(DEFAULT_SETTINGS)
  },
}))

/** Shorthands for code outside React */
export const getSettings = () => useSettings.getState().settings
export const updateSettings = (patch: SettingsPatch) => useSettings.getState().update(patch)

/** Run `listener` whenever the part of the settings that `select` picks changes */
export function watchSettings<T>(select: (s: Settings) => T, listener: (value: T) => void) {
  let previous = select(getSettings())
  return useSettings.subscribe(({ settings }) => {
    const next = select(settings)
    if (Object.is(next, previous)) return
    previous = next
    listener(next)
  })
}

let loading: Promise<Settings> | null = null

/** Read the stored settings once, then follow changes made in other contexts */
export function loadSettings(): Promise<Settings> {
  loading ??= browser.storage.local
    .get(STORAGE_KEY)
    .catch(() => ({}) as Record<string, unknown>)
    .then((stored) => {
      const settings = sanitize(stored[STORAGE_KEY])
      useSettings.setState({ settings, loaded: true })
      browser.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[STORAGE_KEY]) return
        const next = sanitize(changes[STORAGE_KEY].newValue)
        const json = JSON.stringify(next)
        const own = recentWrites.indexOf(json)
        if (own !== -1) return void recentWrites.splice(0, own + 1)
        if (json === JSON.stringify(useSettings.getState().settings)) return
        useSettings.setState({ settings: next })
      })
      return settings
    })
  return loading
}
