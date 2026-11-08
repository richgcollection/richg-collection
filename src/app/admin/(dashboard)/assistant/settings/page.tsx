import Link from 'next/link'
import { requireAdminRole } from '@/lib/auth/dal'
import { getAssistantSettingsForAdmin } from '@/lib/assistant/settings'
import { AssistantSettingsForm } from '@/components/admin/assistant/AssistantSettingsForm'

export const dynamic = 'force-dynamic'

export default async function AdminAssistantSettingsPage() {
  const owner = await requireAdminRole()
  if (!owner) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AI Assistant Settings</h1>
        <p className="mt-2 text-sm opacity-70">Only the store owner (Admin role) can change these settings.</p>
      </div>
    )
  }

  const settings = await getAssistantSettingsForAdmin()

  return (
    <div>
      <Link href="/admin/assistant" className="text-sm opacity-60 hover:opacity-100">
        ← Back to the assistant
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">AI Assistant Settings</h1>
      <p className="mt-1 text-sm opacity-60">
        Choose the AI provider and model, and add its API key here instead of in your hosting provider&apos;s environment
        variables. The assistant reads your store data to answer questions; usage is billed by the provider to that key.
      </p>
      <div className="mt-6">
        <AssistantSettingsForm {...settings} />
      </div>
    </div>
  )
}
