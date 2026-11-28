import Link from 'next/link'

/** A small map of the pages behind a hub. Every href is a real route. */
export function SectionIndex({
  title,
  description,
  items,
}: {
  title: string
  description?: string
  items: Array<{ href: string; label: string; hint: string }>
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-display text-[18px] font-semibold leading-tight text-bone">{title}</h2>
        {description ? <p className="mt-1 text-[13px] leading-relaxed text-bone-dim">{description}</p> : null}
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="panel block h-full p-4 transition-colors hover:border-verdant/60 hover:bg-ink-soft/80">
              <span className="label">{item.label}</span>
              <span className="mt-2 block text-[13px] leading-relaxed text-bone-dim">{item.hint}</span>
              <span aria-hidden="true" className="mt-3 block font-mono text-[11px] text-verdant">Open →</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
