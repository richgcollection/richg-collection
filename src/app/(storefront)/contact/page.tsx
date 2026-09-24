import type { ComponentType, SVGProps } from 'react'
import {
  ArrowUpRightIcon,
  MailIcon,
  MapPinIcon,
  PhoneIcon,
  SOCIAL_ICONS,
  WhatsAppIcon,
} from '@/components/icons/ContactIcons'
import {
  CONTACT_EMAIL,
  PHONE_DISPLAY,
  PHONE_URL,
  SOCIAL_LINKS,
  WHATSAPP_DISPLAY,
  WHATSAPP_URL,
} from '@/lib/contact'

type ContactMethod = {
  label: string
  value: string
  action: string
  href: string
  external?: boolean
  Icon: ComponentType<SVGProps<SVGSVGElement>>
}

const CONTACT_METHODS: ContactMethod[] = [
  {
    label: 'WhatsApp',
    value: WHATSAPP_DISPLAY,
    action: 'Start a chat',
    href: WHATSAPP_URL,
    external: true,
    Icon: WhatsAppIcon,
  },
  { label: 'Call us', value: PHONE_DISPLAY, action: 'Call now', href: PHONE_URL, Icon: PhoneIcon },
  {
    label: 'Email',
    value: CONTACT_EMAIL,
    action: 'Send an email',
    href: `mailto:${CONTACT_EMAIL}`,
    Icon: MailIcon,
  },
]

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-20 sm:py-28">
      <header className="max-w-2xl">
        <span className="text-xs font-medium tracking-[0.2em] uppercase opacity-60">Contact</span>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
          Let&apos;s talk style.
        </h1>
        <p className="mt-5 text-base opacity-70 sm:text-lg">
          Questions about an order, sizing, or a piece you&apos;ve had your eye on? Reach us on
          whichever channel suits you and we&apos;ll get back to you.
        </p>
      </header>

      <div className="mt-14 grid gap-4 md:grid-cols-3">
        {CONTACT_METHODS.map(({ label, value, action, href, external, Icon }) => (
          <a
            key={label}
            href={href}
            {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            className="group relative flex flex-col gap-8 rounded-2xl border border-border bg-surface p-6 transition hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/40"
          >
            <div className="flex items-start justify-between">
              <span className="flex size-12 items-center justify-center rounded-full bg-foreground text-background">
                <Icon className="size-5" />
              </span>
              <ArrowUpRightIcon className="size-5 opacity-40 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium tracking-wide uppercase opacity-60">{label}</span>
              <span className="text-lg font-medium break-all">{value}</span>
              <span className="mt-2 text-sm opacity-60 group-hover:opacity-100">{action}</span>
            </div>
          </a>
        ))}
      </div>

      <section className="mt-16 flex flex-col gap-8 border-t border-border pt-12 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-xs font-medium tracking-[0.2em] uppercase opacity-60">Follow us</h2>
          <p className="mt-3 max-w-sm opacity-70">
            New drops, styling ideas, and behind-the-scenes from the Rich G wardrobe.
          </p>
        </div>

        <ul className="flex flex-wrap gap-3">
          {SOCIAL_LINKS.map(({ name, handle, href }) => {
            const Icon = SOCIAL_ICONS[name]
            return (
              <li key={name}>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${name} (${handle})`}
                  className="flex items-center gap-3 rounded-full border border-border py-2 pr-5 pl-2 transition hover:border-foreground hover:bg-foreground hover:text-background"
                >
                  <span className="flex size-9 items-center justify-center rounded-full bg-surface text-foreground">
                    <Icon className="size-4" />
                  </span>
                  <span className="text-sm font-medium">{name}</span>
                </a>
              </li>
            )
          })}
        </ul>
      </section>

      <p className="mt-12 flex items-center gap-2 text-sm opacity-60">
        <MapPinIcon className="size-4" />
        Nairobi, Kenya
      </p>
    </div>
  )
}
