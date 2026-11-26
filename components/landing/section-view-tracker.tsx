'use client'

import { useEffect } from 'react'
import { getVisitorId, track } from '@/lib/funnel-events'

export type TrackedSectionEvent = 'integration_section_viewed' | 'pilot_section_viewed'

/**
 * Mount beside a landing section and name its DOM id. The event id is derived
 * from the visitor and the allowlisted name, so a reload cannot create a new
 * row for the same visit. Nothing is rendered and nothing else is sent.
 */
export function SectionViewTracker({
  event,
  targetId,
}: {
  event: TrackedSectionEvent
  targetId: string
}) {
  useEffect(() => {
    const target = document.getElementById(targetId)
    if (!target || typeof IntersectionObserver === 'undefined') return
    const visitorId = getVisitorId()
    if (!visitorId) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        track({ event_type: event }, `${event}:${visitorId}`)
        observer.disconnect()
      },
      { threshold: 0.2 },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [event, targetId])

  return null
}

export default SectionViewTracker
