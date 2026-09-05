'use client'

import Image from 'next/image'
import { useState } from 'react'

type GalleryImage = { url: string; altText: string | null }

export function ProductGallery({ images, productName }: { images: GalleryImage[]; productName: string }) {
  const [selected, setSelected] = useState(0)
  const [touchStartX, setTouchStartX] = useState<number | null>(null)

  if (images.length === 0) {
    return (
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-black/5 dark:bg-white/5">
        <div className="flex h-full w-full items-center justify-center text-xs uppercase opacity-40">
          No image
        </div>
      </div>
    )
  }

  const current = images[selected]

  function goTo(index: number) {
    setSelected((index + images.length) % images.length)
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className="group relative aspect-[3/4] w-full touch-pan-y overflow-hidden rounded-lg bg-black/5 dark:bg-white/5"
        onTouchStart={(e) => setTouchStartX(e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchStartX === null) return
          const deltaX = e.changedTouches[0].clientX - touchStartX
          if (Math.abs(deltaX) > 40) goTo(selected + (deltaX < 0 ? 1 : -1))
          setTouchStartX(null)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') goTo(selected + 1)
          if (e.key === 'ArrowLeft') goTo(selected - 1)
        }}
        tabIndex={0}
        role="group"
        aria-label={`${productName} images`}
      >
        <Image
          key={current.url}
          src={current.url}
          alt={current.altText ?? productName}
          fill
          sizes="(min-width: 768px) 50vw, 100vw"
          className="object-cover transition-transform duration-300 ease-out group-hover:scale-105"
          priority
        />

        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => goTo(selected - 1)}
              aria-label="Previous image"
              className="absolute top-1/2 left-2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-black opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white dark:bg-black/60 dark:text-white dark:hover:bg-black/80"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => goTo(selected + 1)}
              aria-label="Next image"
              className="absolute top-1/2 right-2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-black opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white dark:bg-black/60 dark:text-white dark:hover:bg-black/80"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>

            <div className="absolute right-0 bottom-3 left-0 flex justify-center gap-1.5 sm:hidden">
              {images.map((image, index) => (
                <button
                  key={image.url}
                  type="button"
                  onClick={() => goTo(index)}
                  aria-label={`Go to image ${index + 1}`}
                  className={`h-1.5 rounded-full transition-all ${
                    index === selected ? 'w-4 bg-white' : 'w-1.5 bg-white/60'
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {images.length > 1 && (
        <div className="hidden gap-3 sm:flex">
          {images.map((image, index) => (
            <button
              key={image.url}
              type="button"
              onClick={() => goTo(index)}
              aria-label={`View image ${index + 1}`}
              className={`relative h-20 w-16 shrink-0 overflow-hidden rounded-md border transition-opacity ${
                index === selected
                  ? 'border-foreground'
                  : 'border-black/10 opacity-60 hover:opacity-100 dark:border-white/10'
              }`}
            >
              <Image src={image.url} alt="" fill sizes="64px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
