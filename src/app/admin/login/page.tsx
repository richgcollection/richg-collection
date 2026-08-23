import { redirect } from 'next/navigation'
import { AdminLoginForm } from '@/components/admin/AdminLoginForm'
import { getCurrentAdmin } from '@/lib/auth/dal'

export default async function AdminLoginPage() {
  const admin = await getCurrentAdmin()
  if (admin) redirect('/admin')

  return (
    <div className="flex min-h-full flex-1 items-center justify-center px-6 py-24">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Rich G Admin</h1>
        <p className="mb-8 text-sm opacity-60">Sign in to manage your store.</p>
        <AdminLoginForm />
      </div>
    </div>
  )
}
