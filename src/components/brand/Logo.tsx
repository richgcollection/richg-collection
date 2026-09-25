// The RG monogram, stored as a transparent mask in /public/brand and painted
// by the .brand-logo class: black on light backgrounds, gold on dark ones.
// Size it with a height class; the width follows the artwork's aspect ratio.
export function LogoMark({ className = '' }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Rich G Collection"
      className={`brand-logo ${className}`}
      style={{
        aspectRatio: 509 / 500,
        maskImage: 'url(/brand/logo-mark.png)',
        WebkitMaskImage: 'url(/brand/logo-mark.png)',
      }}
    />
  )
}
