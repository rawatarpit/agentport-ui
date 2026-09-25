import type { Config } from 'tailwindcss'

/**
 * A deliberately small token set. The console is a dark-first operations
 * surface, not a marketing page: dense, quiet, and readable for long stretches.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#0f0e0c', soft: '#17150f', line: '#262319' },
        bone: { DEFAULT: '#efece6', dim: '#c3baab', faint: '#8f867a' },
        verdant: { DEFAULT: '#2f9c68', soft: '#1e7f4f' },
        amber: { DEFAULT: '#c08a2e' },
        rust: { DEFAULT: '#b4553a' },
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
