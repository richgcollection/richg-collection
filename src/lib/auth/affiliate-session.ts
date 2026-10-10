import 'server-only'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

// Deliberately separate from the admin session: different cookie, payload
// shape and audience, so an affiliate token can never pass as an admin one.
const SESSION_COOKIE = 'affiliate_session'
const SESSION_AUDIENCE = 'affiliate'
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 14 // 14 days

function getSecretKey() {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET is not set.')
  return new TextEncoder().encode(secret)
}

export type AffiliateSessionPayload = {
  kind: 'affiliate'
  affiliateId: string
}

async function decryptAffiliateSession(token: string | undefined): Promise<AffiliateSessionPayload | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ['HS256'],
      audience: SESSION_AUDIENCE,
    })
    if (payload.kind !== 'affiliate' || typeof payload.affiliateId !== 'string') return null
    return { kind: 'affiliate', affiliateId: payload.affiliateId }
  } catch {
    return null
  }
}

export async function createAffiliateSession(affiliateId: string) {
  const token = await new SignJWT({ kind: 'affiliate', affiliateId })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecretKey())
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DURATION_SECONDS,
  })
}

export async function getAffiliateSession(): Promise<AffiliateSessionPayload | null> {
  const cookieStore = await cookies()
  return decryptAffiliateSession(cookieStore.get(SESSION_COOKIE)?.value)
}

export async function deleteAffiliateSession() {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
}
