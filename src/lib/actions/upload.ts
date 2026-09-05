'use server'

import { put } from '@vercel/blob'
import { requireAdmin } from '@/lib/auth/dal'

const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024 // 4MB — see next.config.ts for why

export type UploadResult = { success: true; url: string } | { success: false; error: string }

export async function uploadProductImageAction(formData: FormData): Promise<UploadResult> {
  await requireAdmin()

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return { success: false, error: 'No file provided.' }
  }
  if (!file.type.startsWith('image/')) {
    return { success: false, error: 'Only image files are allowed.' }
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { success: false, error: 'Image is too large. Please use a file under 4MB.' }
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return {
      success: false,
      error: 'Image storage is not configured yet (missing BLOB_READ_WRITE_TOKEN).',
    }
  }

  try {
    const blob = await put(`products/${crypto.randomUUID()}-${file.name}`, file, {
      access: 'public',
    })
    return { success: true, url: blob.url }
  } catch (error) {
    console.error('Image upload failed:', error)
    const message = error instanceof Error ? error.message : 'Upload failed.'
    return { success: false, error: `Upload failed: ${message}` }
  }
}
