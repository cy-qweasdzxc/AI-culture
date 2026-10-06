interface ProgressBarProps {
  value: number
  max: number
  label?: string
}

export default function ProgressBar({ value, max, label }: ProgressBarProps) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      {label ? <span className="text-xs text-bluegray">{label}</span> : null}
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper-deep"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemax={max}
        aria-label={label ?? '进度'}
      >
        <div className="h-full rounded-full bg-cinnabar transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-9 text-right text-xs tabular-nums text-ink-soft">{pct}%</span>
    </div>
  )
}
