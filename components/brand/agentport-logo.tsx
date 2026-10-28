import type { SVGProps } from 'react'

export function AgentPortLogo({
  markOnly = false,
  className = '',
  ...props
}: SVGProps<SVGSVGElement> & { markOnly?: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg
        width="32"
        height="32"
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label={markOnly ? 'AgentPort' : undefined}
        {...props}
      >
        <rect x="2" y="2" width="60" height="60" rx="14" fill="#0f0e0c" />
        <rect x="2" y="2" width="60" height="60" rx="14" stroke="#2f9c68" strokeWidth="3" opacity="0.6" />
        <path
          d="M18 44V20L32 32L46 20V44"
          stroke="#2f9c68"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="50" cy="16" r="4" fill="#2f9c68" />
      </svg>
      {!markOnly ? <span className="font-display text-lg text-bone">AgentPort</span> : null}
    </div>
  )
}
