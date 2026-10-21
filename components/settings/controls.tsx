import type { ReactNode } from 'react'
import clsx from 'clsx'

// Building blocks for the popup, in the IVE companion's style (daisyUI
// "dim" theme, cards on base-200, small caps labels).

export const Label = ({ children }: { children: ReactNode }) => (
  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-base-content/40">
    {children}
  </p>
)

export const Toggle = ({
  title,
  description,
  checked,
  onChange,
  disabled,
}: {
  title: string
  description?: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) => (
  <label
    className={clsx(
      'flex items-center justify-between gap-4 cursor-pointer',
      disabled && 'opacity-40 pointer-events-none',
    )}
  >
    <span className="min-w-0">
      <span className="block text-[13px] font-medium leading-tight text-base-content">
        {title}
      </span>
      {description && (
        <span className="block text-[11px] leading-snug text-base-content/45 mt-0.5">
          {description}
        </span>
      )}
    </span>
    <input
      type="checkbox"
      className="toggle toggle-primary toggle-sm shrink-0"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
    />
  </label>
)

/** A row of buttons, one of which is chosen */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: ReactNode }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="flex gap-0.5 p-0.75 rounded-[0.7rem] bg-base-100 border border-base-300">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={clsx(
            'flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg text-[13px] transition-colors cursor-pointer',
            option.value === value
              ? 'btn-brand font-semibold'
              : 'text-base-content/55 font-medium hover:text-base-content hover:bg-base-200',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
