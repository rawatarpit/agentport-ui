'use client'

import { useEffect, useState } from 'react'

/**
 * Light / dark switch. Dark is the default; the choice persists in
 * localStorage and the class flips on <html> with no re-render. The inline
 * script in the root layout applies the stored choice before first paint,
 * so there is no flash — this control only changes the stored value.
 */
export function ThemeToggle() {
  const [dark, setDark] = useState(true)

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'))
  }, [])

  const flip = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    try {
      localStorage.setItem('agentport-theme', next ? 'dark' : 'light')
    } catch {}
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={flip}
      className="flex w-full items-center justify-between gap-2 rounded-md border border-ink-line px-3 py-2 outline-none transition-colors hover:border-verdant focus-visible:ring-2 focus-visible:ring-verdant/60"
    >
      <span className="flex items-center gap-1.5" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={dark ? 'text-bone-faint' : 'text-amber'}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={dark ? 'text-verdant' : 'text-bone-faint'}>
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      </span>
      <span
        aria-hidden="true"
        className="relative h-5 w-9 shrink-0 rounded-full border border-ink-line bg-ink transition-colors"
      >
        <span
          className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-bone transition-all ${
            dark ? 'left-[18px]' : 'left-0.5'
          }`}
        />
      </span>
    </button>
  )
}
