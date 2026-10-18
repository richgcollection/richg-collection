import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { brandedEmailHtml, escapeHtml, isEmailConfigured, sendEmail, siteUrl } from '@/lib/email'
import type { SendEmailResult } from '@/lib/email'

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

export function hashInviteToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

/** A fresh single-use token. The hash claims it; the raw token is kept until then so admins can re-copy the link. */
export function createInviteToken(now = new Date()) {
  const token = randomBytes(32).toString('base64url')
  return {
    token,
    data: {
      inviteTokenHash: hashInviteToken(token),
      inviteToken: token,
      inviteExpiresAt: new Date(now.getTime() + INVITE_TTL_MS),
      inviteSentAt: now,
    },
  }
}

export function isInviteOpen(expiresAt: Date | null, now = new Date()) {
  return Boolean(expiresAt && expiresAt > now)
}

export function inviteUrl(token: string) {
  return `${siteUrl()}/affiliate/signup?invite=${encodeURIComponent(token)}`
}

/** What the admin sees after (re)sending an invite. */
export type InviteDelivery = { inviteUrl: string; emailSent: boolean; notice?: string }

export function describeDelivery(url: string, result: SendEmailResult): InviteDelivery {
  if (result.ok) return { inviteUrl: url, emailSent: true }
  return {
    inviteUrl: url,
    emailSent: false,
    notice:
      result.reason === 'not_configured'
        ? 'Email isn’t configured (RESEND_API_KEY / EMAIL_FROM), so no email was sent. Copy the link below and send it yourself.'
        : 'The invite email could not be sent. Copy the link below and send it yourself (e.g. on WhatsApp).',
  }
}

export async function sendAffiliateInviteEmail({ name, email, url }: { name: string; email: string; url: string }) {
  const firstName = name.split(/\s+/)[0] || name
  const html = brandedEmailHtml({
    preheader: 'Set your password to start earning commission on Rich G sales.',
    heading: 'You’re invited to the Rich G affiliate programme',
    bodyHtml: `<p style="margin:0 0 12px">Hi ${escapeHtml(firstName)},</p>
<p style="margin:0 0 12px">The Rich G Collection team has set up an affiliate account for you. Set your password to see your referral links, sales and commission.</p>
<p style="margin:0;color:#6b6b6b;font-size:13px">This link works once and expires in 7 days.</p>`,
    cta: { label: 'Activate my account', url },
  })
  const text = `Hi ${firstName},

The Rich G Collection team has set up an affiliate account for you. Set your password to see your referral links, sales and commission:

${url}

This link works once and expires in 7 days. If you weren't expecting this, you can ignore this email.

Rich G Collection`
  return sendEmail({ to: email, subject: 'Your Rich G affiliate invite', html, text })
}

export async function sendAffiliateApprovedEmail({ name, email }: { name: string; email: string }) {
  if (!isEmailConfigured()) return { ok: false, reason: 'not_configured', error: 'Email is not configured.' } as const
  const firstName = name.split(/\s+/)[0] || name
  const url = `${siteUrl()}/affiliate/login`
  const html = brandedEmailHtml({
    preheader: 'Your Rich G affiliate account is approved.',
    heading: 'You’re approved',
    bodyHtml: `<p style="margin:0 0 12px">Hi ${escapeHtml(firstName)},</p>
<p style="margin:0">Good news: your Rich G Collection affiliate account is now active. Sign in to get your referral links and track your commission.</p>`,
    cta: { label: 'Sign in', url },
  })
  const text = `Hi ${firstName},

Good news: your Rich G Collection affiliate account is now active. Sign in to get your referral links and track your commission:

${url}

Rich G Collection`
  return sendEmail({ to: email, subject: 'Your Rich G affiliate account is approved', html, text })
}
