import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getAdminSession } from '@/lib/auth/session'

export const getCurrentAdmin = cache(async () => {
  const session = await getAdminSession()
  if (!session) return null

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, name: true, role: true },
  })
  if (!user || (user.role !== 'ADMIN' && user.role !== 'STAFF')) return null

  return user
})

export async function requireAdmin() {
  const admin = await getCurrentAdmin()
  if (!admin) redirect('/admin/login')
  return admin
}
