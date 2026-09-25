export function Stat({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string
  value: string | number
  hint?: string
  tone?: 'default' | 'good' | 'warn' | 'bad'
}) {
  const colour =
    tone === 'good'
      ? 'text-verdant'
      : tone === 'warn'
        ? 'text-amber'
        : tone === 'bad'
          ? 'text-rust'
          : 'text-bone'
  return (
    <div className="panel p-4">
      <p className="label">{label}</p>
      <p className={`tabular mt-2 font-display text-3xl ${colour}`}>{value}</p>
      {hint ? <p className="mt-1 text-[12px] leading-snug text-bone-faint">{hint}</p> : null}
    </div>
  )
}

export function Badge({ children, tone }: { children: React.ReactNode; tone: 'allow' | 'deny' | 'held' | 'idle' }) {
  const map = {
    allow: 'border-verdant/40 text-verdant',
    deny: 'border-rust/40 text-rust',
    held: 'border-amber/40 text-amber',
    idle: 'border-ink-line text-bone-faint',
  } as const
  return (
    <span className={`inline-block rounded border px-2 py-0.5 font-mono text-[11px] ${map[tone]}`}>
      {children}
    </span>
  )
}
