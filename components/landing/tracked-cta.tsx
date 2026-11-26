'use client'

import Link from 'next/link'
import type { ComponentProps, MouseEvent } from 'react'
import { track } from '@/lib/funnel-events'

export type TrackedCtaEvent = 'hero_primary_cta_clicked' | 'hero_demo_cta_clicked'

type TrackedCtaProps = Omit<ComponentProps<typeof Link>, 'onClick'> & {
  event: TrackedCtaEvent
  onClick?: (click: MouseEvent<HTMLAnchorElement>) => void
}

/**
 * The only hero link wrapper allowed to emit funnel events. It takes no
 * payload: the route receives an allowlisted name and the current pathname,
 * never the link text, destination query, or visitor-supplied context.
 */
export function TrackedCta({ event, onClick, ...rest }: TrackedCtaProps) {
  return (
    <Link
      {...rest}
      onClick={(click: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(click)
        if (click.defaultPrevented) return
        track({ event_type: event })
      }}
    />
  )
}

export default TrackedCta
