import type { SVGProps } from 'react'

/**
 * The AgentPort mark: a gateway (the port) with an agent passing through it.
 *
 * Two legs and an arch read as an opening at 16px; the node is the agent, the
 * short approach line is the call arriving. The badge stays dark in both
 * themes on purpose — a mark that changes shape with the surface stops being
 * a mark. The wordmark is set in the display serif and splits "Agent" /
 * "Port" so the name is legible before the colour is.
 */
export function AgentPortLogo({
  markOnly = false,
  showWordmark = true,
  size = 32,
  className = '',
  ...props
}: SVGProps<SVGSVGElement> & {
  markOnly?: boolean
  showWordmark?: boolean
  size?: number
}) {
  const withWordmark = showWordmark && !markOnly

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role={withWordmark ? 'presentation' : 'img'}
        aria-label={withWordmark ? undefined : 'AgentPort'}
        aria-hidden={withWordmark ? true : undefined}
        {...props}
      >
        <rect x="1.5" y="1.5" width="61" height="61" rx="15" fill="#0d0c0a" />
        <rect
          x="1.5"
          y="1.5"
          width="61"
          height="61"
          rx="15"
          stroke="#2f9c68"
          strokeOpacity="0.38"
          strokeWidth="1.5"
        />
        {/* The gateway: two legs and an arch, the opening the agent passes through. */}
        <path
          d="M24 47V29a8 8 0 0 1 16 0v18"
          stroke="#2f9c68"
          strokeWidth="3.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* The call arriving, and the agent at the threshold. */}
        <path d="M13.5 37h6" stroke="#2f9c68" strokeOpacity="0.55" strokeWidth="3" strokeLinecap="round" />
        <circle cx="32" cy="37" r="4" fill="#2f9c68" />
      </svg>
      {withWordmark ? (
        <span className="font-display text-[19px] leading-none tracking-[-0.01em] text-bone">
          Agent<span className="text-verdant">Port</span>
        </span>
      ) : null}
    </span>
  )
}
