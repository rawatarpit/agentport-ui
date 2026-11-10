import type { Metadata } from 'next'
import { headers } from 'next/headers'
import './globals.css'

export const metadata: Metadata = {
  title: 'Agent Port Console',
  description:
    'Governed agent capabilities for a business: what agents may do, what was refused, and what is waiting for a human.',
  icons: {
    icon: '/icon.svg',
    shortcut: '/favicon.ico',
    apple: '/icon.svg',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Set per-request by middleware; the CSP allows this exact nonce. Without it
  // the inline theme script would be reported under script-src.
  const nonce = headers().get('x-nonce') ?? undefined
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Theme before paint: dark unless the merchant chose light. Runs
            before React hydrates, so there is no flash either way. */}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(localStorage.getItem('agentport-theme')!=='light'){document.documentElement.classList.add('dark')}}catch(e){document.documentElement.classList.add('dark')}})()`,
          }}
        />
      </head>
      <body className="min-h-screen">{children}</body>
    </html>
  )
}
