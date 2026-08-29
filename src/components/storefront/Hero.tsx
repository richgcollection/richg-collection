import Image from 'next/image'
import Link from 'next/link'

export function Hero() {
  return (
    <section className="relative flex h-[80vh] min-h-[520px] items-start overflow-hidden pt-28 sm:pt-32">
      <Image
        src="/images/hero.png"
        alt="Rich G Collection"
        fill
        priority
        sizes="100vw"
        className="object-cover object-[center_15%]"
      />
      {/* Scrim on the left (clear gray area, away from the men) for text legibility */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/10 to-transparent" />
      {/* Fade into the page background so the image doesn't end on a hard edge */}
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background to-transparent" />

      <div className="relative mx-auto w-full max-w-6xl px-6">
        <div className="flex max-w-sm flex-col items-start gap-6">
          <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Rich G Collection
          </h1>
          <p className="text-base text-white/85">
            At Rich G Collection, our goal is to ensure that the modern classic man has access to a
            collection that is sustainable, durable, authentic and comfortable at a bargain.
          </p>
          <Link
            href="/shop"
            className="rounded-full bg-white px-6 py-3 text-sm font-medium text-black hover:opacity-90"
          >
            Shop Now
          </Link>
        </div>
      </div>
    </section>
  )
}
