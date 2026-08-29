import Image from 'next/image'
import Link from 'next/link'

export function Hero() {
  return (
    <section className="relative flex aspect-video w-full items-start overflow-hidden pt-6 sm:pt-16 md:pt-24">
      {/* The section matches the source photo's own 16:9 aspect ratio, so
          object-cover shows it in full at any viewport width — nothing
          gets cropped off the top or bottom the way a fixed vh height would. */}
      <Image
        src="/images/hero.png"
        alt="Rich G Collection"
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />
      {/* Scrim on the left (clear gray area, away from the men) for text legibility */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/10 to-transparent" />
      {/* Fade into the page background so the image doesn't end on a hard edge */}
      <div className="absolute inset-x-0 bottom-0 h-1/5 bg-gradient-to-t from-background to-transparent" />

      <div className="relative mx-auto w-full max-w-6xl px-6">
        <div className="flex max-w-[85%] flex-col items-start gap-2 sm:max-w-sm sm:gap-6">
          <h1 className="text-lg font-semibold tracking-tight text-white sm:text-4xl md:text-5xl">
            Rich G Collection
          </h1>
          <p className="hidden text-base text-white/85 sm:block">
            At Rich G Collection, our goal is to ensure that the modern classic man has access to a
            collection that is sustainable, durable, authentic and comfortable at a bargain.
          </p>
          <Link
            href="/shop"
            className="rounded-full bg-white px-4 py-2 text-xs font-medium text-black hover:opacity-90 sm:px-6 sm:py-3 sm:text-sm"
          >
            Shop Now
          </Link>
        </div>
      </div>
    </section>
  )
}
