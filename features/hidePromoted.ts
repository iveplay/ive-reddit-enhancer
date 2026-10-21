import { setRootClass } from '@/lib/dom'
import { getSettings, watchSettings } from '@/lib/settings'

// Promoted posts and other ads. CSS only (styles/page.scss); the viewer and
// the media filter skip them on their own.
export function initHidePromoted() {
  const apply = () => setRootClass('ire-no-promoted', getSettings().features.hidePromoted)
  watchSettings((s) => s.features.hidePromoted, apply)
  apply()
}
