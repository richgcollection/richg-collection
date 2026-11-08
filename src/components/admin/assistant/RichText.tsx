import { Fragment, type ReactNode } from 'react'

/**
 * Renders the small Markdown subset the assistant is asked to use: paragraphs,
 * "-"/numbered lists, "#" headings, pipe tables, **bold** and `code`.
 * Builds React nodes (no HTML injection), so model output can't add markup.
 */
export function RichText({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n')
  const blocks: ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }

    if (line.trim().startsWith('|')) {
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells)
        i++
      }
      const [head, ...body] = rows
      blocks.push(
        <div key={blocks.length} className="my-2 overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                {head.map((c, j) => (
                  <th key={j} className="border-b border-black/15 px-2 py-1 text-left font-semibold dark:border-white/15">
                    {inline(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((r, k) => (
                <tr key={k}>
                  {r.map((c, j) => (
                    <td key={j} className="border-b border-black/5 px-2 py-1 tabular-nums dark:border-white/5">
                      {inline(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }

    const bullet = /^\s*(?:[-*•]|\d+[.)])\s+/
    if (bullet.test(line)) {
      const ordered = /^\s*\d/.test(line)
      const items: string[] = []
      while (i < lines.length && bullet.test(lines[i])) {
        items.push(lines[i].replace(bullet, ''))
        i++
      }
      const List = ordered ? 'ol' : 'ul'
      blocks.push(
        <List key={blocks.length} className={`my-1 space-y-0.5 pl-5 ${ordered ? 'list-decimal' : 'list-disc'}`}>
          {items.map((it, k) => (
            <li key={k}>{inline(it)}</li>
          ))}
        </List>,
      )
      continue
    }

    const heading = /^#{1,6}\s+(.*)$/.exec(line)
    if (heading) {
      blocks.push(
        <p key={blocks.length} className="mt-3 mb-1 font-semibold">
          {inline(heading[1])}
        </p>,
      )
      i++
      continue
    }

    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !lines[i].trim().startsWith('|') && !bullet.test(lines[i]) && !/^#{1,6}\s/.test(lines[i])) {
      para.push(lines[i])
      i++
    }
    blocks.push(
      <p key={blocks.length} className="my-1.5">
        {para.map((p, k) => (
          <Fragment key={k}>
            {k > 0 && <br />}
            {inline(p)}
          </Fragment>
        ))}
      </p>,
    )
  }

  return <>{blocks}</>
}

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, k) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={k}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2)
      return (
        <code key={k} className="rounded bg-surface px-1 py-0.5 text-[0.9em]">
          {part.slice(1, -1)}
        </code>
      )
    return part
  })
}
