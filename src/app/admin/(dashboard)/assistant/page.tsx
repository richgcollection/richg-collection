import Link from 'next/link'
import { getCurrentAdmin, isAdminRole } from '@/lib/auth/dal'
import { loadAssistantConfig } from '@/lib/assistant/settings'
import { PROVIDERS } from '@/lib/assistant/providers'
import { AssistantChat } from '@/components/admin/assistant/AssistantChat'

export const dynamic = 'force-dynamic'

export default async function AdminAssistantPage() {
  const [admin, status] = await Promise.all([getCurrentAdmin(), loadAssistantConfig()])
  const canConfigure = isAdminRole(admin)

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AI Assistant</h1>
          {status.ready && (
            <p className="mt-1 text-sm opacity-60">
              {PROVIDERS[status.config.provider].label} · {status.config.model}
              {status.config.allowActions ? '' : ' · read-only'}
            </p>
          )}
        </div>
        {canConfigure && (
          <Link href="/admin/assistant/settings" className="text-sm underline opacity-70 hover:opacity-100">
            Settings
          </Link>
        )}
      </div>
      <AssistantChat ready={status.ready} reason={status.ready ? undefined : status.reason} canConfigure={canConfigure} />
    </div>
  )
}
