/** "now", "5m", "3h", "2d", "4mo", "1y" */
export function timeAgo(date: Date, now = Date.now()) {
  const seconds = Math.max(0, (now - date.getTime()) / 1000)
  if (seconds < 60) return 'now'
  const steps: [number, string][] = [
    [60, 'm'],
    [24, 'h'],
    [30, 'd'],
    [12, 'mo'],
    [Infinity, 'y'],
  ]
  let value = seconds / 60
  for (const [size, unit] of steps) {
    if (value < size) return `${Math.floor(value)}${unit}`
    value /= size
  }
  return ''
}

/** 950, 1.2k, 12k, 1.4m */
export function compactNumber(n: number) {
  const abs = Math.abs(n)
  if (abs < 1000) return String(n)
  const [value, unit] = abs < 1e6 ? [n / 1e3, 'k'] : [n / 1e6, 'm']
  return `${Math.abs(value) < 10 ? value.toFixed(1).replace(/\.0$/, '') : Math.round(value)}${unit}`
}

/** The post's date written out, for hover titles */
export const fullDate = (date: Date) =>
  date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
