'use client'

import Image from 'next/image'
import { useRef, useState } from 'react'
import { uploadProductImageAction } from '@/lib/actions/upload'

export function ImageUploader({
  urls,
  onChange,
}: {
  urls: string[]
  onChange: (urls: string[]) => void
}) {
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function uploadFiles(files: FileList | File[]) {
    setError(null)
    setIsUploading(true)
    const uploaded: string[] = []

    for (const file of Array.from(files)) {
      const formData = new FormData()
      formData.set('file', file)
      const result = await uploadProductImageAction(formData)
      if (result.success) {
        uploaded.push(result.url)
      } else {
        setError(result.error)
      }
    }

    if (uploaded.length > 0) onChange([...urls, ...uploaded])
    setIsUploading(false)
  }

  function removeAt(index: number) {
    onChange(urls.filter((_, i) => i !== index))
  }

  return (
    <div className="flex flex-col gap-3">
      {urls.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {urls.map((url, index) => (
            <div key={url + index} className="relative h-24 w-20 overflow-hidden rounded-md border border-black/10 dark:border-white/10">
              <Image src={url} alt="" fill className="object-cover" unoptimized />
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
        <p className="mt-1 text-xs opacity-50">JPG, PNG, or WebP — up to 4MB each</p>
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

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
