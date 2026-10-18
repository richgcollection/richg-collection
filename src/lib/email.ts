import 'server-only'

export type SendEmailResult =
  | { ok: true; id?: string }
  | { ok: false; reason: 'not_configured' | 'failed'; error: string }

export type EmailMessage = {
  to: string
  subject: string
  html: string
  text: string
  replyTo?: string
}

export function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)
}

export function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Sends through the Resend REST API. Never throws: callers decide what a failure means. */
export async function sendEmail(message: EmailMessage): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  if (!apiKey || !from) {
    return { ok: false, reason: 'not_configured', error: 'Email is not configured (RESEND_API_KEY / EMAIL_FROM).' }
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    })
    const body = (await response.json().catch(() => null)) as { id?: string; message?: string } | null
    if (!response.ok) {
      const error = body?.message ?? `Resend responded with ${response.status}`
      console.error('[email] send failed:', error)
      return { ok: false, reason: 'failed', error }
    }
    return { ok: true, id: body?.id }
  } catch (error) {
    console.error('[email] send failed:', error)
    return { ok: false, reason: 'failed', error: error instanceof Error ? error.message : 'Network error' }
  }
}

/** A simple branded layout shared by transactional emails. `bodyHtml` must already be escaped. */
export function brandedEmailHtml({
  preheader,
  heading,
  bodyHtml,
  cta,
}: {
  preheader: string
  heading: string
  bodyHtml: string
  cta?: { label: string; url: string }
}) {
  const button = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0"><tr><td style="border-radius:999px;background:#111111">
<a href="${escapeHtml(cta.url)}" style="display:inline-block;padding:14px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px">${escapeHtml(cta.label)}</a>
</td></tr></table>
<p style="margin:0 0 8px;font-size:12px;color:#6b6b6b">Or paste this link into your browser:</p>
<p style="margin:0;font-size:12px;word-break:break-all"><a href="${escapeHtml(cta.url)}" style="color:#111111">${escapeHtml(cta.url)}</a></p>`
    : ''

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111111">
<div style="display:none;max-height:0;overflow:hidden">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f2;padding:32px 16px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#111111;padding:20px 32px;color:#ffffff;font-size:15px;font-weight:700;letter-spacing:.18em;text-transform:uppercase">Rich G Collection</td></tr>
<tr><td style="padding:32px">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3">${escapeHtml(heading)}</h1>
<div style="font-size:15px;line-height:1.6">${bodyHtml}</div>
${button}
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #eeeeee;font-size:12px;color:#8a8a8a">
Rich G Collection · <a href="${escapeHtml(siteUrl())}" style="color:#8a8a8a">${escapeHtml(siteUrl().replace(/^https?:\/\//, ''))}</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}
