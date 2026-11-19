import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { getCurrentAdmin } from '@/lib/auth/dal'
import { MAX_IMAGE_SIZE_BYTES } from '@/lib/upload-limits'

export const dynamic = 'force-dynamic'

/**
 * Issues short-lived Vercel Blob tokens so admins can upload product images
 * straight from the browser. Files never pass through this function, which
 * sidesteps Vercel's 4.5MB serverless request-body limit.
 */
export async function POST(request: Request) {
  const admin = await getCurrentAdmin()
  if (!admin) return Response.json({ error: 'Not signed in.' }, { status: 401 })

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json(
      { error: 'Image storage is not configured yet (missing BLOB_READ_WRITE_TOKEN).' },
      { status: 500 },
    )
  }

  const body = (await request.json().catch(() => null)) as HandleUploadBody | null
  if (!body) return Response.json({ error: 'Invalid request.' }, { status: 400 })

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith('products/')) throw new Error('Invalid upload path.')
        return {
          allowedContentTypes: ['image/*'],
          maximumSizeInBytes: MAX_IMAGE_SIZE_BYTES,
          addRandomSuffix: true,
        }
      },
    })
    return Response.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed.'
    return Response.json({ error: message }, { status: 400 })
  }
}
