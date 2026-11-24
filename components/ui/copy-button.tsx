'use client'

import { useState } from 'react'

/**
 * Minimal client copy button.
 *
 * No credentials, no secrets, no privileged tokens ever pass through here —
 * it only copies text the page already rendered (the request ID and the
 * merchant CLI command). A failed copy degrades to leaving the text on
 * screen so the merchant can copy it by hand.
 */
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1_500)
    } catch {
      // Clipboard unavailable: the rendered text remains copyable by hand.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="btn btn-secondary px-3 py-2 text-[11px] font-mono disabled:opacity-50"
      disabled={copied}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}
