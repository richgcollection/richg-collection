import 'server-only'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

/**
 * Encrypts the assistant's LLM API key at rest (AES-256-GCM). The key is
 * derived from AUTH_SECRET, so a database leak alone doesn't expose it.
 * Rotating AUTH_SECRET makes stored keys unreadable: the admin re-enters it.
 */

function encryptionKey(): Buffer {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET is not set.')
  return createHash('sha256').update(`assistant-api-key:${secret}`).digest()
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return ['v1', iv.toString('base64'), tag.toString('base64'), data.toString('base64')].join(':')
}

/** Returns null when the value can't be decrypted (e.g. AUTH_SECRET changed). */
export function decryptSecret(stored: string): string | null {
  const [version, iv, tag, data] = stored.split(':')
  if (version !== 'v1' || !iv || !tag || !data) return null
  try {
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'))
    decipher.setAuthTag(Buffer.from(tag, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

/** "sk-ant-…a1B2" style hint so admins can tell which key is saved without seeing it. */
export function maskSecret(plain: string): string {
  if (plain.length <= 8) return '••••'
  return `${plain.slice(0, Math.min(6, plain.length - 4))}…${plain.slice(-4)}`
}
