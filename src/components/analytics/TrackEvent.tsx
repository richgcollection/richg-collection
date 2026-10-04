'use client'

import { useEffect, useRef } from 'react'
import { trackMetaPixelEvent } from '@/components/analytics/MetaPixel'

export function TrackEvent({
  event,
  params,
  eventId,
}: {
  event: string
  params?: Record<string, unknown>
  /** Shared with the server-side Conversions API event so Meta deduplicates the two. */
  eventId?: string
}) {
  const fired = useRef(false)

  useEffect(() => {
    if (fired.current) return
    fired.current = true
    trackMetaPixelEvent(event, params, eventId)
    // Only fire once per mount — intentionally ignoring params identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event])

  return null
}
