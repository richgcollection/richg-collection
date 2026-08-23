import { AdminHeader } from '@/components/admin/AdminHeader'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { requireAdmin } from '@/lib/auth/dal'

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin()

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AdminHeader email={admin.email} />
      <div className="flex flex-1">
        <AdminSidebar />
        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  )
}
