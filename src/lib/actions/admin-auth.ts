'use server'

import bcrypt from 'bcryptjs'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createAdminSession, deleteAdminSession } from '@/lib/auth/session'
import { prisma } from '@/lib/prisma'

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
})

export type AdminLoginState = { error?: string } | undefined

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

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } })
  if (!user || !user.passwordHash || (user.role !== 'ADMIN' && user.role !== 'STAFF')) {
    return { error: 'Invalid email or password.' }
  }

  const passwordMatches = await bcrypt.compare(parsed.data.password, user.passwordHash)
  if (!passwordMatches) {
    return { error: 'Invalid email or password.' }
  }

  await createAdminSession({ userId: user.id, role: user.role })
  redirect('/admin')
}

export async function adminLogoutAction() {
  await deleteAdminSession()
  redirect('/admin/login')
}
