'use client'

import Image from 'next/image'
import { useRef, useState } from 'react'
import { uploadProductImageAction } from '@/lib/actions/upload'

const MAX_IMAGES = 5

export function ImageUploader({
  urls,
  onChange,
}: {
  urls: string[]
  onChange: (urls: string[]) => void
}) {
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const atLimit = urls.length >= MAX_IMAGES

  async function uploadFiles(files: FileList | File[]) {
    setError(null)
    setSuccess(null)

    const remainingSlots = MAX_IMAGES - urls.length
    if (remainingSlots <= 0) {
      setError(`Maximum ${MAX_IMAGES} images per product — remove one to add another.`)
      return
    }

    const fileArray = Array.from(files)
    const toUpload = fileArray.slice(0, remainingSlots)
    const skipped = fileArray.length - toUpload.length

    setIsUploading(true)
    const uploaded: string[] = []

    try {
      for (const file of toUpload) {
        const formData = new FormData()
        formData.set('file', file)
        const result = await uploadProductImageAction(formData)
        if (result.success) {
          uploaded.push(result.url)
        } else {
          setError(result.error)
        }
      }
      if (uploaded.length > 0) {
        onChange([...urls, ...uploaded])
        const skippedNote = skipped > 0 ? ` (${skipped} skipped — ${MAX_IMAGES} image limit reached)` : ''
        setSuccess(
          `${uploaded.length} image${uploaded.length === 1 ? '' : 's'} uploaded.${skippedNote}`,
        )
      }
    } catch {
      setError('Upload failed unexpectedly. Please try again.')
    } finally {
      setIsUploading(false)
    }
  }

  function removeAt(index: number) {
    setSuccess(null)
    onChange(urls.filter((_, i) => i !== index))
  }

  return (
    <div className="flex flex-col gap-3">
      {urls.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {urls.map((url, index) => (
            <div key={url + index} className="relative h-24 w-20 overflow-hidden rounded-md border border-black/10 dark:border-white/10">
              <Image src={url} alt="" fill className="object-cover" unoptimized />
              {index === 0 && (
                <span className="absolute bottom-0.5 left-0.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-white uppercase">
                  Featured
                </span>
              )}
              <button
                type="button"
                onClick={() => removeAt(index)}
                className="absolute top-0.5 right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-xs text-white"
                aria-label="Remove image"
              >
                &times;
              </button>
              <input type="hidden" name="imageUrls" value={url} />
            </div>
          ))}
        </div>
      )}

      {atLimit ? (
        <p className="rounded-md border border-dashed border-black/20 px-4 py-3 text-center text-sm opacity-60 dark:border-white/20">
          Maximum {MAX_IMAGES} images reached — remove one to add another.
        </p>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setIsDragging(false)
            if (e.dataTransfer.files.length) void uploadFiles(e.dataTransfer.files)
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed px-4 py-6 text-center text-sm transition-colors ${
            isDragging ? 'border-foreground bg-surface' : 'border-black/20 dark:border-white/20'
          }`}
        >
          <p className="opacity-70">
            {isUploading ? 'Uploading…' : 'Click or drag images here to upload'}
          </p>
          <p className="mt-1 text-xs opacity-50">
            JPG, PNG, or WebP — up to 4MB each · up to {MAX_IMAGES} images, first is the featured image
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            disabled={isUploading}
            onChange={(e) => {
              if (e.target.files?.length) void uploadFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </div>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {success && !error && <p className="text-sm text-emerald-600 dark:text-emerald-400">{success}</p>}
    </div>
  )
}
