import { adminLogoutAction } from '@/lib/actions/admin-auth'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { LogoImage } from '@/components/brand/Logo'

export function AdminHeader({ email }: { email: string }) {
  return (
    <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
      <div className="flex items-center gap-3">
        <LogoImage part="mark" className="h-8" />
        <span className="text-sm font-medium">Admin</span>
      </div>
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
