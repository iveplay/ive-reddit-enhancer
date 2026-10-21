import { IconLayoutDashboard, IconMovie, IconPhoto, IconVolume, type Icon } from '@tabler/icons-react'
import type { MediaFilter } from '@/lib/settings'

/** The media filter's choices, as listed in the dock's filter menu */
export const FILTER_OPTIONS: { value: MediaFilter; label: string; hint: string; Icon: Icon }[] = [
  { value: 'all', label: 'All posts', hint: 'No filter', Icon: IconLayoutDashboard },
  { value: 'photos', label: 'Photos', hint: 'Images and galleries', Icon: IconPhoto },
  { value: 'moving', label: 'Videos & GIFs', hint: 'Anything that moves', Icon: IconMovie },
  { value: 'sound', label: 'With sound', hint: 'Videos that have audio', Icon: IconVolume },
]
