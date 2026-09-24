import { CONTACT_EMAIL, WHATSAPP_DISPLAY, WHATSAPP_URL } from '@/lib/contact'

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-24">
      <h1 className="text-3xl font-semibold tracking-tight">Contact</h1>
      <p className="mt-4 opacity-80">
        Questions about an order, sizing, or a product? Reach out and we&apos;ll get back to you.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <a
          href={WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col gap-1 rounded-lg border border-black/10 p-6 hover:border-black/30 dark:border-white/10 dark:hover:border-white/30"
        >
          <span className="text-xs font-medium tracking-wide uppercase opacity-60">WhatsApp</span>
          <span className="text-lg font-medium">{WHATSAPP_DISPLAY}</span>
        </a>
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="flex flex-col gap-1 rounded-lg border border-black/10 p-6 hover:border-black/30 dark:border-white/10 dark:hover:border-white/30"
        >
          <span className="text-xs font-medium tracking-wide uppercase opacity-60">Email</span>
          <span className="text-lg font-medium break-all">{CONTACT_EMAIL}</span>
        </a>
      </div>

      <p className="mt-10 text-sm opacity-60">Nairobi, Kenya</p>
    </div>
  )
}
