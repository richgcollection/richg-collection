'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Re-fetches the current server-rendered page on an interval while the tab is visible. */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter()

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh()
    }, seconds * 1000)
    return () => clearInterval(interval)
  }, [router, seconds])

  return null
}
