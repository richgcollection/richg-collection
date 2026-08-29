import Link from 'next/link'

export function BrandStory() {
  return (
    <section className="border-y border-black/10 bg-surface dark:border-white/10">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-6 py-20 text-center">
        <p className="text-sm tracking-widest uppercase opacity-60">More Than Clothing</p>
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">It&apos;s a Lifestyle</h2>
        <p className="text-base opacity-80">
          Rich G Collection isn&apos;t just a clothing brand — it&apos;s a lifestyle. A Rich G man takes
          care of himself in every aspect: how he dresses, how he carries himself, and how he trains.
          Fitness isn&apos;t optional, it&apos;s the foundation. We build a wardrobe for men who put in
          the work — in the gym and in life — and expect their clothing to keep up: sharp, durable, and
          built to last.
        </p>
        <Link
          href="/about"
          className="rounded-full border border-foreground px-6 py-3 text-sm font-medium hover:bg-foreground hover:text-background"
        >
          Learn More
        </Link>
      </div>
    </section>
  )
}
