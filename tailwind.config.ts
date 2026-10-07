import type { Config } from 'tailwindcss'

/**
 * A deliberately small token set, resolved through CSS variables so the
 * product ships both themes. Dark is the default (`.dark` on <html>);
 * light is the absence of it. Semantic colors (verdant/amber/rust) hold
 * their meaning in both — a refusal is rust on paper too.
 *
 * Values live in `app/globals.css` (`:root` = light, `.dark` = dark) so the
 * toggle is one class flip with no re-render and no flash (see the inline
 * script in `app/layout.tsx` that sets it before paint).
 */
function rgb(variable: string) {
  return `rgb(var(${variable}) / <alpha-value>)`
}

const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: rgb('--ink'), soft: rgb('--ink-soft'), line: rgb('--ink-line') },
        bone: { DEFAULT: rgb('--bone'), dim: rgb('--bone-dim'), faint: rgb('--bone-faint') },
        verdant: { DEFAULT: rgb('--verdant'), soft: rgb('--verdant-soft') },
        amber: { DEFAULT: rgb('--amber') },
        rust: { DEFAULT: rgb('--rust') },
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config
