import { useEffect, useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import {
  IconArrowsMaximize,
  IconCheck,
  IconChevronsDown,
  IconFilter,
  IconLayoutGrid,
  IconLayoutList,
  IconLoader2,
  IconMinus,
  IconPlayerPauseFilled,
  IconPlus,
} from '@tabler/icons-react'
import { NARROW_QUERY, TOUCH_QUERY, useMedia } from '@/lib/device'
import {
  GRID_COLS,
  GRID_COLS_NARROW,
  SCROLL_SPEEDS,
  updateSettings,
  useSettings,
} from '@/lib/settings'
import { changeScrollSpeed, toggleAutoScroll, useAutoScroll } from '@/features/autoScroll'
import { useFeedPresent } from '@/features/feed'
import { useFilterStats } from '@/features/mediaFilter'
import { openViewer } from '@/features/viewer/controller'
import { useViewer } from '@/features/viewer/store'
import { FILTER_OPTIONS } from '../filterOptions'
import styles from './Dock.module.scss'

type Menu = 'filter' | 'layout' | null

/** Floating toolbar in the bottom corner of every Reddit page */
export function Dock() {
  const settings = useSettings((s) => s.settings)
  const hasFeed = useFeedPresent()
  const viewerOpen = useViewer((s) => s.open)
  const toast = useViewer((s) => s.toast)
  const [menu, setMenu] = useState<Menu>(null)
  const dockRef = useRef<HTMLDivElement>(null)

  // Close the open menu on a click anywhere else, or Escape
  useEffect(() => {
    if (!menu) return
    const onPointer = (event: PointerEvent) => {
      if (!event.composedPath().includes(dockRef.current!)) setMenu(null)
    }
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setMenu(null)
    document.addEventListener('pointerdown', onPointer, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onPointer, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [menu])

  if (viewerOpen) return null

  const { features } = settings
  const toggle = (next: Menu) => setMenu((current) => (current === next ? null : next))

  return (
    <div ref={dockRef} className={styles.dock} data-side={settings.dock.side}>
      {toast && <div className={styles.toast}>{toast}</div>}
      <div className={styles.panel}>
        {hasFeed && (
          <Anchor open={menu === 'filter'} popover={<FilterMenu onPick={() => setMenu(null)} />}>
            <FilterButton active={menu === 'filter'} onClick={() => toggle('filter')} />
          </Anchor>
        )}
        {hasFeed && (
          <Anchor open={menu === 'layout'} popover={<LayoutMenu />}>
            <DockButton
              tip="Layout"
              on={settings.grid.on}
              active={menu === 'layout'}
              onClick={() => toggle('layout')}
            >
              {settings.grid.on ? <IconLayoutGrid {...ICON} /> : <IconLayoutList {...ICON} />}
            </DockButton>
          </Anchor>
        )}
        <AutoScrollButton />
        {features.viewer && (
          <>
            <span className={styles.divider} />
            <DockButton tip="Fullscreen viewer" brand onClick={() => openViewer()}>
              <IconArrowsMaximize {...ICON} />
            </DockButton>
          </>
        )}
      </div>
    </div>
  )
}

const ICON = { size: 20, stroke: 1.8 }

function DockButton({
  tip,
  on,
  active,
  brand,
  onClick,
  children,
}: {
  tip: string
  on?: boolean
  active?: boolean
  brand?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={clsx(
        styles.button,
        on && styles.on,
        active && styles.active,
        brand && styles.brand,
      )}
      data-tip={active ? undefined : tip}
      aria-label={tip}
      aria-pressed={on}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

// A dock button with a popover that opens beside it
function Anchor({
  open,
  popover,
  children,
}: {
  open: boolean
  popover: ReactNode
  children: ReactNode
}) {
  return (
    <div className={styles.anchor}>
      {children}
      {open && <div className={styles.popover}>{popover}</div>}
    </div>
  )
}

function FilterButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  const filter = useSettings((s) => s.settings.mediaFilter)
  const hidden = useFilterStats((s) => s.hidden)
  const option = FILTER_OPTIONS.find((o) => o.value === filter)!
  return (
    <DockButton
      tip={filter === 'all' ? 'Filter posts' : `Showing: ${option.label}`}
      on={filter !== 'all'}
      active={active}
      onClick={onClick}
    >
      {filter === 'all' ? <IconFilter {...ICON} /> : <option.Icon {...ICON} />}
      {filter !== 'all' && hidden > 0 && (
        <span className={styles.badge}>{hidden > 99 ? '99+' : hidden}</span>
      )}
    </DockButton>
  )
}

function FilterMenu({ onPick }: { onPick: () => void }) {
  const filter = useSettings((s) => s.settings.mediaFilter)
  const { hidden, checking } = useFilterStats()
  return (
    <>
      <p className={styles.menuLabel}>Show</p>
      {FILTER_OPTIONS.map(({ value, label, hint, Icon }) => (
        <button
          key={value}
          type="button"
          className={clsx(styles.menuItem, filter === value && styles.selected)}
          onClick={() => {
            updateSettings({ mediaFilter: value })
            onPick()
          }}
        >
          <Icon size={18} stroke={1.8} className={styles.menuIcon} />
          <span className={styles.menuText}>
            <span>{label}</span>
            <small>{hint}</small>
          </span>
          {filter === value && <IconCheck size={16} stroke={2.2} className={styles.check} />}
        </button>
      ))}
      {filter !== 'all' && (
        <p className={styles.menuFooter}>
          {checking && <IconLoader2 size={13} className={styles.spin} />}
          {checking
            ? 'Checking which clips have sound…'
            : `${hidden} post${hidden === 1 ? '' : 's'} hidden on this page`}
        </p>
      )}
    </>
  )
}

function LayoutMenu() {
  const grid = useSettings((s) => s.settings.grid)
  const setGrid = (patch: Partial<typeof grid>) => updateSettings({ grid: patch })
  // Phones keep a column count of their own; the stepper sets the one in use
  const narrow = useMedia(NARROW_QUERY)
  const colsKey = narrow ? 'narrowCols' : 'cols'
  const limits = narrow ? GRID_COLS_NARROW : GRID_COLS
  const cols = grid[colsKey]
  const touch = useMedia(TOUCH_QUERY)
  return (
    <>
      <p className={styles.menuLabel}>View</p>
      <div className={styles.segmented}>
        <button
          type="button"
          className={clsx(!grid.on && styles.selected)}
          onClick={() => setGrid({ on: false })}
        >
          <IconLayoutList size={16} stroke={1.8} /> List
        </button>
        <button
          type="button"
          className={clsx(grid.on && styles.selected)}
          onClick={() => setGrid({ on: true })}
        >
          <IconLayoutGrid size={16} stroke={1.8} /> Grid
        </button>
      </div>
      <div className={clsx(styles.row, !grid.on && styles.disabled)}>
        <span>Columns</span>
        <div className={styles.stepper}>
          <button
            type="button"
            aria-label="Fewer columns"
            disabled={!grid.on || cols <= limits.min}
            onClick={() => setGrid({ [colsKey]: cols - 1 })}
          >
            <IconMinus size={14} stroke={2.2} />
          </button>
          <span className={styles.value}>{cols}</span>
          <button
            type="button"
            aria-label="More columns"
            disabled={!grid.on || cols >= limits.max}
            onClick={() => setGrid({ [colsKey]: cols + 1 })}
          >
            <IconPlus size={14} stroke={2.2} />
          </button>
        </div>
      </div>
      <label className={clsx(styles.row, !grid.on && styles.disabled)}>
        <span className={styles.menuText}>
          <span>Compact cards</span>
          <small>
            {touch ? 'Media only, details along the bottom' : 'Media only, details on hover'}
          </small>
        </span>
        <input
          type="checkbox"
          className={styles.toggle}
          checked={grid.compact}
          disabled={!grid.on}
          onChange={(e) => setGrid({ compact: e.target.checked })}
        />
      </label>
    </>
  )
}

function AutoScrollButton() {
  const running = useAutoScroll((s) => s.running)
  const level = useSettings((s) => s.settings.autoScroll.level)
  return (
    <div className={styles.anchor}>
      <DockButton
        tip={running ? 'Stop auto-scroll' : 'Auto-scroll'}
        on={running}
        onClick={toggleAutoScroll}
      >
        {running ? <IconPlayerPauseFilled size={18} /> : <IconChevronsDown {...ICON} />}
      </DockButton>
      {running && (
        <div className={clsx(styles.popover, styles.speed)}>
          <button type="button" aria-label="Slower" onClick={() => changeScrollSpeed(-1)}>
            <IconMinus size={14} stroke={2.2} />
          </button>
          <span className={styles.bars} title={`Speed ${level + 1} of ${SCROLL_SPEEDS.length}`}>
            {SCROLL_SPEEDS.map((_, i) => (
              <i key={i} className={clsx(i <= level && styles.lit)} style={{ height: 6 + i * 2 }} />
            ))}
          </span>
          <button type="button" aria-label="Faster" onClick={() => changeScrollSpeed(1)}>
            <IconPlus size={14} stroke={2.2} />
          </button>
        </div>
      )}
    </div>
  )
}
