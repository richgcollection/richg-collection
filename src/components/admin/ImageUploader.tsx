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
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const atLimit = urls.length >= MAX_IMAGES

  async function uploadFiles(files: FileList | File[]) {
    setError(null)
    setSuccess(null)

    const remainingSlots = MAX_IMAGES - urls.length
    if (remainingSlots <= 0) {
      setError(`Maximum ${MAX_IMAGES} images per product. Remove one to add another.`)
      return
    }

    const fileArray = Array.from(files)
    const toUpload = fileArray.slice(0, remainingSlots)
    const skipped = fileArray.length - toUpload.length

    setIsUploading(true)
    setProgress({ completed: 0, total: toUpload.length })
    const uploaded: string[] = []

    try {
      for (const [index, file] of toUpload.entries()) {
        const formData = new FormData()
        formData.set('file', file)
        const result = await uploadProductImageAction(formData)
        if (result.success) {
          uploaded.push(result.url)
        } else {
          setError(result.error)
        }
        setProgress({ completed: index + 1, total: toUpload.length })
      }
      if (uploaded.length > 0) {
        onChange([...urls, ...uploaded])
        const skippedNote = skipped > 0 ? ` (${skipped} skipped, ${MAX_IMAGES} image limit reached)` : ''
        setSuccess(
          `${uploaded.length} image${uploaded.length === 1 ? '' : 's'} uploaded.${skippedNote}`,
        )
      }
    } catch {
      setError('Upload failed unexpectedly. Please try again.')
    } finally {
      setIsUploading(false)
      setProgress(null)
    }
  }

  function removeAt(index: number) {
    setSuccess(null)
    onChange(urls.filter((_, i) => i !== index))
  }

  // Reorders images; whatever lands at index 0 becomes the featured image.
  function moveImage(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= urls.length || to >= urls.length) return
    const next = [...urls]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setSuccess(null)
    onChange(next)
  }

  function endDrag() {
    setDragIndex(null)
    setOverIndex(null)
  }

  return (
    <div className="flex flex-col gap-3">
      {urls.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {urls.map((url, index) => (
            <div
              key={url + index}
              draggable
              onDragStart={(e) => {
                setDragIndex(index)
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', String(index))
              }}
              onDragOver={(e) => {
                if (dragIndex === null) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (overIndex !== index) setOverIndex(index)
              }}
              onDrop={(e) => {
                if (dragIndex === null) return
                e.preventDefault()
                moveImage(dragIndex, index)
                endDrag()
              }}
              onDragEnd={endDrag}
              title="Drag to reorder"
              className={`group relative h-24 w-20 cursor-grab overflow-hidden rounded-md border transition active:cursor-grabbing ${
                dragIndex === index ? 'opacity-40' : ''
              } ${
                overIndex === index && dragIndex !== index
                  ? 'border-foreground ring-2 ring-foreground'
                  : 'border-black/10 dark:border-white/10'
              }`}
            >
              <Image src={url} alt="" fill draggable={false} className="pointer-events-none object-cover" unoptimized />
              {index === 0 ? (
                <span className="absolute bottom-0.5 left-0.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-white uppercase">
                  Featured
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => moveImage(index, 0)}
                  className="absolute bottom-0.5 left-0.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-white uppercase opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100"
                  aria-label="Make featured image"
                >
                  ★ Feature
                </button>
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
          Maximum {MAX_IMAGES} images reached. Remove one to add another.
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
            {progress ? `Uploading ${progress.completed} of ${progress.total}…` : 'Click or drag images here to upload'}
          </p>
          {progress ? (
            <div className="mt-2 h-1.5 w-40 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
              <div
                className="h-full rounded-full bg-foreground transition-all duration-300"
                style={{ width: `${(progress.completed / progress.total) * 100}%` }}
              />
            </div>
          ) : (
            <p className="mt-1 text-xs opacity-50">
              JPG, PNG, or WebP, up to 4MB each · up to {MAX_IMAGES} images · drag thumbnails to reorder, first is the featured image
            </p>
          )}
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
