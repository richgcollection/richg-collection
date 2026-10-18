'use server'

import bcrypt from 'bcryptjs'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createAdminSession, deleteAdminSession } from '@/lib/auth/session'
import {
  THROTTLED_MESSAGE,
  clearFailedAttempts,
  isThrottled,
  recordFailedAttempt,
  throttleKey,
} from '@/lib/auth/rate-limit'
import { prisma } from '@/lib/prisma'

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
})

export type AdminLoginState = { error?: string } | undefined

// Compared against when there's no usable account, so a miss takes as long as a wrong password (same cost as the seed's hashes).
const DUMMY_HASH = '$2b$10$TIggmy0.qFrEsIPcSgLHIeCYh.8pUOtMZhuH12KSM2WmxUunRBN2u'

export async function adminLoginAction(
  _prevState: AdminLoginState,
  formData: FormData,
): Promise<AdminLoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    return { error: 'Enter a valid email and password.' }
  }

  const key = await throttleKey('admin-login', parsed.data.email)
  if (await isThrottled(key)) return { error: THROTTLED_MESSAGE }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } })
  const account =
    user?.passwordHash && (user.role === 'ADMIN' || user.role === 'STAFF')
      ? { id: user.id, role: user.role, passwordHash: user.passwordHash }
      : null
  const passwordMatches = await bcrypt.compare(parsed.data.password, account?.passwordHash ?? DUMMY_HASH)
  if (!account || !passwordMatches) {
    await recordFailedAttempt(key)
    return { error: 'Invalid email or password.' }
  }

  await clearFailedAttempts(key)
  await createAdminSession({ userId: account.id, role: account.role })
  redirect('/admin')
}

export async function adminLogoutAction() {
  await deleteAdminSession()
  redirect('/admin/login')
}
