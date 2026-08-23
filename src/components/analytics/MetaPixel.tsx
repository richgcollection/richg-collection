'use client'

import Script from 'next/script'
import { Suspense, useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void
    _fbq?: unknown
  }
}

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID

function PixelPageviewTracker() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!PIXEL_ID || !window.fbq) return
    window.fbq('track', 'PageView')
    // Re-fires on every client-side route change (App Router doesn't do full reloads).
  }, [pathname, searchParams])

  return null
}

export function MetaPixel() {
  if (!PIXEL_ID) return null

  return (
    <>
      <Script id="meta-pixel-base" strategy="afterInteractive">
        {`
          !function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window, document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '${PIXEL_ID}');
          fbq('track', 'PageView');
        `}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          alt=""
          style={{ display: 'none' }}
          src={`https://www.facebook.com/tr?id=${PIXEL_ID}&ev=PageView&noscript=1`}
        />
      </noscript>
      <Suspense fallback={null}>
        <PixelPageviewTracker />
      </Suspense>
    </>
  )
}

/** Fire a standard Meta Pixel event from a Client Component. No-op if the pixel isn't configured/loaded. */
export function trackMetaPixelEvent(event: string, params?: Record<string, unknown>) {
  if (typeof window === 'undefined' || !window.fbq) return
  window.fbq('track', event, params)
}
