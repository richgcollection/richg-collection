import 'server-only'
import { createHmac } from 'node:crypto'
import { headers } from 'next/headers'
import { after } from 'next/server'
import { prisma } from '@/lib/prisma'

// Serverless instances don't share memory, so attempts are counted in the database.

export type ThrottleScope = 'affiliate-login' | 'affiliate-signup' | 'admin-login'
export type ThrottleKey = { scope: ThrottleScope; ipHash: string; emailHash: string }

const WINDOW_MS = 15 * 60 * 1000
const MAX_PER_EMAIL_AND_IP = 5
const MAX_PER_IP = 20
const RETENTION_MS = 24 * 60 * 60 * 1000
const CLEANUP_PROBABILITY = 0.05

export const THROTTLED_MESSAGE = 'Too many attempts. Please wait a few minutes and try again.'

async function clientIp() {
  const h = await headers()
  const forwarded = h.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || h.get('x-real-ip')?.trim() || 'unknown'
}

function keyedHash(kind: 'ip' | 'email', value: string) {
  return createHmac('sha256', process.env.AUTH_SECRET || 'richg-rate-limit').update(`${kind}:${value}`).digest('hex')
}

export async function throttleKey(scope: ThrottleScope, email: string): Promise<ThrottleKey> {
  return {
    scope,
    ipHash: keyedHash('ip', await clientIp()),
    emailHash: keyedHash('email', email.trim().toLowerCase()),
  }
}

/** True once this email+IP or this IP alone has too many recent failures in the scope. */
export async function isThrottled(key: ThrottleKey) {
  const createdAt = { gte: new Date(Date.now() - WINDOW_MS) }
  const [forPair, forIp] = await Promise.all([
    prisma.loginAttempt.count({
      where: { scope: key.scope, emailHash: key.emailHash, ipHash: key.ipHash, createdAt },
    }),
    prisma.loginAttempt.count({ where: { scope: key.scope, ipHash: key.ipHash, createdAt } }),
  ])
  return forPair >= MAX_PER_EMAIL_AND_IP || forIp >= MAX_PER_IP
}

export async function recordFailedAttempt(key: ThrottleKey) {
  await prisma.loginAttempt.create({ data: key })
  if (Math.random() < CLEANUP_PROBABILITY) {
    after(async () => {
      try {
        await prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - RETENTION_MS) } } })
      } catch (error) {
        console.error('[rate-limit] cleanup failed:', error)
      }
    })
  }
}

/** A successful sign-in wipes this email+IP's failures (the IP-wide count keeps everyone else's). */
export async function clearFailedAttempts(key: ThrottleKey) {
  await prisma.loginAttempt.deleteMany({ where: { scope: key.scope, emailHash: key.emailHash, ipHash: key.ipHash } })
}
