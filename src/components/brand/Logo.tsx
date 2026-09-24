const LOGOS = {
  full: { src: '/brand/logo-full.png', ratio: 936 / 817 },
  mark: { src: '/brand/logo-mark.png', ratio: 509 / 500 },
  name: { src: '/brand/logo-name.png', ratio: 936 / 80 },
} as const

type LogoPart = keyof typeof LOGOS

// One piece of the logo artwork. Size it with a height (or width) class; the
// other dimension follows the artwork's aspect ratio.
export function LogoImage({ part, className = '' }: { part: LogoPart; className?: string }) {
  const { src, ratio } = LOGOS[part]
  return (
    <span
      aria-hidden="true"
      className={`brand-logo ${className}`}
      style={{ aspectRatio: ratio, maskImage: `url(${src})`, WebkitMaskImage: `url(${src})` }}
    />
  )
}

// Horizontal lockup for headers: RG monogram beside the wordmark.
export function LogoLockup({ className = '' }: { className?: string }) {
  return (
    <span role="img" aria-label="Rich G Collection" className={`flex items-center gap-3 ${className}`}>
      <LogoImage part="mark" className="h-9" />
      <LogoImage part="name" className="h-3 sm:h-3.5" />
    </span>
  )
}

// Stacked logo with tagline, for footers and standalone placements.
export function LogoFull({ className = '' }: { className?: string }) {
  return (
    <span role="img" aria-label="Rich G Collection, look good, feel good" className="block">
      <LogoImage part="full" className={className} />
    </span>
  )
}
