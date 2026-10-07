'use client'

import { useEffect, useState } from 'react'

/**
 * Light / dark toggle. Dark is the default; the choice persists in
 * localStorage and the class flips on <html> with no re-render. The inline
 * script in the root layout applies the stored choice before first paint,
 * so there is no flash — this component only changes the stored value.
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
      className="btn w-full justify-center"
      onClick={flip}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {dark ? 'Light' : 'Dark'}
    </button>
  )
}
