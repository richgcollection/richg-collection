/**
 * Builders for WhatsApp Cloud API message bodies. The bot returns these and
 * n8n posts each one, unchanged, to POST /{phone-number-id}/messages after
 * adding `messaging_product` and `to`. Limits below are Meta's: longer text is
 * rejected, so everything is clipped here rather than at send time.
 */

export type WaMessage = Record<string, unknown> & { type: string }

export type ListRow = { id: string; title: string; description?: string }
export type ListSection = { title?: string; rows: ListRow[] }
export type Button = { id: string; title: string }

const clip = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1)}…`)

export function text(body: string): WaMessage {
  return { type: 'text', text: { body: clip(body, 4096), preview_url: false } }
}

export function image(url: string, caption?: string): WaMessage {
  return { type: 'image', image: { link: url, ...(caption ? { caption: clip(caption, 1024) } : {}) } }
}

/** Up to 3 reply buttons. */
export function buttons(body: string, items: Button[], footer?: string): WaMessage {
  return {
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: clip(body, 1024) },
      ...(footer ? { footer: { text: clip(footer, 60) } } : {}),
      action: {
        buttons: items.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: b.id, title: clip(b.title, 20) } })),
      },
    },
  }
}

/** A list message: at most 10 rows across all sections. */
export function list(body: string, buttonLabel: string, sections: ListSection[], header?: string): WaMessage {
  let remaining = 10
  const trimmed = sections
    .map((section) => {
      const rows = section.rows.slice(0, remaining)
      remaining -= rows.length
      return {
        ...(section.title ? { title: clip(section.title, 24) } : {}),
        rows: rows.map((r) => ({
          id: clip(r.id, 200),
          title: clip(r.title, 24),
          ...(r.description ? { description: clip(r.description, 72) } : {}),
        })),
      }
    })
    .filter((section) => section.rows.length > 0)

  return {
    type: 'interactive',
    interactive: {
      type: 'list',
      ...(header ? { header: { type: 'text', text: clip(header, 60) } } : {}),
      body: { text: clip(body, 4096) },
      action: { button: clip(buttonLabel, 20), sections: trimmed },
    },
  }
}

/** A message with a single link button (used for the Paystack payment link). */
export function linkButton(body: string, label: string, url: string): WaMessage {
  return {
    type: 'interactive',
    interactive: {
      type: 'cta_url',
      body: { text: clip(body, 1024) },
      action: { name: 'cta_url', parameters: { display_text: clip(label, 20), url } },
    },
  }
}
