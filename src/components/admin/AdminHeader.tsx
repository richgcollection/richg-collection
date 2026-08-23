import { adminLogoutAction } from '@/lib/actions/admin-auth'
import { ThemeToggle } from '@/components/theme/ThemeToggle'

export function AdminHeader({ email }: { email: string }) {
  return (
    <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
      <span className="text-sm font-medium">Rich G Admin</span>
      <div className="flex items-center gap-4">
        <span className="text-sm opacity-60">{email}</span>
        <ThemeToggle />
        <form action={adminLogoutAction}>
          <button type="submit" className="text-sm opacity-70 hover:opacity-100">
            Sign Out
          </button>
        </form>
      </div>
    </header>
  )
}
