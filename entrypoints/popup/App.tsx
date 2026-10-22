import type { ReactNode } from 'react'
import { IconRotateClockwise } from '@tabler/icons-react'
import { TOUCH_QUERY, useMedia } from '@/lib/device'
import { updateSettings, useSettings, type Settings } from '@/lib/settings'
import { Label, Segmented, Toggle } from '@/components/settings/controls'

// The extension's settings: which features are on, and how the page starts
// out. Things you do on the page itself (grid/list, columns, filter, viewer)
// live in the dock there.

type Feature = keyof Settings['features']

export function App() {
  const s = useSettings((state) => state.settings)
  const reset = useSettings((state) => state.reset)
  const f = s.features
  // The sidebar features stay off on touch screens (see features/layout.ts)
  const touch = useMedia(TOUCH_QUERY)

  const feature = (key: Feature, title: string, description: string) => (
    <Toggle
      title={title}
      description={description}
      checked={f[key]}
      onChange={(on) => updateSettings({ features: { [key]: on } })}
    />
  )

  return (
    // Firefox for Android opens the popup as a whole page: fill it
    <main className="w-[340px] max-h-[600px] pointer-coarse:w-full pointer-coarse:max-h-none pointer-coarse:min-h-dvh overflow-y-auto page-scroll bg-base-100 text-base-content">
      <header className="sticky top-0 z-10 flex items-center gap-2.5 px-4 h-14 border-b border-base-300 surface-chrome">
        <span className="logo-mark text-2xl">IVE</span>
        <span className="text-[9px] font-bold uppercase tracking-[3px] text-base-content/30 pt-1">
          reddit enhancer
        </span>
        <span className="ml-auto text-[10px] tabular-nums text-base-content/30 pt-0.5">
          v{browser.runtime.getManifest().version}
        </span>
        <button
          className="btn btn-ghost btn-xs btn-square text-base-content/40 hover:text-base-content"
          title="Reset to defaults"
          aria-label="Reset to defaults"
          onClick={reset}
        >
          <IconRotateClockwise size={14} />
        </button>
      </header>

      <div className="p-3 flex flex-col gap-3">
        <Group label="Viewer">
          {feature('viewer', 'Fullscreen viewer', 'Click media in the feed to open it')}
          <Toggle
            title="Preload next images"
            description="Load the posts around the current one ahead"
            checked={s.viewer.preload}
            disabled={!f.viewer}
            onChange={(preload) => updateSettings({ viewer: { preload } })}
          />
          <Toggle
            title="Scroll through galleries"
            description="Wheel and slideshow show every image; off skips to the next post"
            checked={s.viewer.throughGalleries}
            disabled={!f.viewer}
            onChange={(throughGalleries) => updateSettings({ viewer: { throughGalleries } })}
          />
          {feature(
            'redgifsHelper',
            'Redgifs in HD with sound',
            'HD by default, sound on in the viewer',
          )}
        </Group>

        <Group label="Page">
          {feature('hidePromoted', 'Hide promoted posts', 'Ads in feeds, sidebars and comments')}
          {feature(
            'userLinks',
            'Profile links open posts',
            'Go to /submitted instead of the overview',
          )}
          {!touch &&
            feature(
              'rightSidebar',
              'Collapse right sidebar',
              'Tucked behind a rail, slides in on hover',
            )}
          {!touch &&
            feature('leftSidebarMemory', 'Remember left sidebar', 'Reopen it the way you left it')}
          <div className="flex items-center justify-between gap-4">
            <span className="text-[13px] font-medium">Dock position</span>
            <div className="w-32">
              <Segmented
                options={[
                  { value: 'left', label: 'Left' },
                  { value: 'right', label: 'Right' },
                ]}
                value={s.dock.side}
                onChange={(side) => updateSettings({ dock: { side } })}
              />
            </div>
          </div>
        </Group>
      </div>
    </main>
  )
}

// A labelled card of rows, split by hairlines
const Group = ({ label, children }: { label: string; children: ReactNode }) => (
  <section className="flex flex-col gap-1.5">
    <div className="px-1">
      <Label>{label}</Label>
    </div>
    <div className="rounded-xl bg-base-200 border border-base-300 px-3 divide-y divide-base-300 [&>*]:py-2.5">
      {children}
    </div>
  </section>
)
