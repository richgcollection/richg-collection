import Image from 'next/image'
import Link from 'next/link'

export function Hero() {
  return (
    <section className="relative flex h-[80vh] min-h-[520px] items-end overflow-hidden">
      <Image
        src="/images/hero.png"
        alt="Rich G Collection"
        fill
        priority
        sizes="100vw"
        className="object-cover object-[center_15%]"
      />
      {/* Scrim for text legibility over the photo */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
      {/* Fade into the page background so the image doesn't end on a hard edge */}
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background to-transparent" />

      <div className="relative mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-6 pb-16">
        <p className="text-sm tracking-widest text-white/70 uppercase">New Collection</p>
        <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          Rich G Collection
        </h1>
        <p className="max-w-xl text-base text-white/85">
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
    </section>
  )
}
