import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-6 py-24">
      <p className="text-sm tracking-widest uppercase opacity-60">New Collection</p>
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Rich G Collection</h1>
      <p className="max-w-xl text-base opacity-80">
        At Rich G Collection, our goal is to ensure that the modern classic man has access to a
        collection that is sustainable, durable, authentic and comfortable at a bargain.
      </p>
      <Link
        href="/shop"
        className="rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background hover:opacity-90"
      >
        Shop Now
      </Link>
    </div>
  )
}
