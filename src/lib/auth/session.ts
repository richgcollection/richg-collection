import 'server-only'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

const SESSION_COOKIE = 'admin_session'
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7 // 7 days

function getSecretKey() {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET is not set.')
  return new TextEncoder().encode(secret)
}

export type SessionPayload = {
  userId: string
  role: 'ADMIN' | 'STAFF'
}

export async function encryptSession(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecretKey())
}

export async function decryptSession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), { algorithms: ['HS256'] })
    if (typeof payload.userId !== 'string' || typeof payload.role !== 'string') return null
    return { userId: payload.userId, role: payload.role as SessionPayload['role'] }
  } catch {
    return null
  }
}

export async function createAdminSession(payload: SessionPayload) {
  const token = await encryptSession(payload)
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DURATION_SECONDS,
  })
}

export async function getAdminSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies()
  return decryptSession(cookieStore.get(SESSION_COOKIE)?.value)
}

export async function deleteAdminSession() {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
}
