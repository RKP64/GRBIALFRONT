/* Answers come back as markdown — bold, bullet lists, the occasional heading.
   Rendering them into a plain <p> shows the syntax rather than the formatting,
   which is what makes a good answer look like a wall of asterisks.

   Written by hand rather than pulling in a markdown library: the models produce
   a narrow subset, a dependency would need installing before the app runs, and
   anything a library would give us beyond this is formatting we do not want a
   model emitting into a chat panel anyway. */

function inline(text, keyPrefix) {
  // **bold**, *italic*, `code`, and bare URLs. Split on all of them at once so
  // the pieces stay in order.
  const parts = String(text).split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|https?:\/\/\S+)/g)
  return parts.filter(Boolean).map((part, i) => {
    const key = `${keyPrefix}-${i}`
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={key}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={key}>{part.slice(1, -1)}</em>
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={key} className="md-code">{part.slice(1, -1)}</code>
    }
    if (/^https?:\/\//.test(part)) {
      return (
        <a key={key} href={part} target="_blank" rel="noreferrer" className="md-link">
          {part.length > 60 ? part.slice(0, 57) + '…' : part}
        </a>
      )
    }
    return <span key={key}>{part}</span>
  })
}

export default function Markdown({ children, className = '' }) {
  const source = String(children || '').trim()
  if (!source) return null

  const lines = source.split('\n')
  const blocks = []
  let list = null          // collects consecutive list items
  let ordered = false

  const flushList = () => {
    if (!list) return
    const Tag = ordered ? 'ol' : 'ul'
    blocks.push(
      <Tag key={`l-${blocks.length}`} className="md-list">
        {list.map((item, i) => <li key={i}>{inline(item, `li-${blocks.length}-${i}`)}</li>)}
      </Tag>
    )
    list = null
  }

  lines.forEach((raw, idx) => {
    const line = raw.trim()

    if (!line) { flushList(); return }

    // - item  |  * item  |  • item
    const bullet = line.match(/^[-*•]\s+(.*)$/)
    if (bullet) {
      if (list && ordered) flushList()
      ordered = false
      list = list || []
      list.push(bullet[1])
      return
    }

    // 1. item
    const numbered = line.match(/^\d+[.)]\s+(.*)$/)
    if (numbered) {
      if (list && !ordered) flushList()
      ordered = true
      list = list || []
      list.push(numbered[1])
      return
    }

    flushList()

    const heading = line.match(/^(#{1,4})\s+(.*)$/)
    if (heading) {
      const level = heading[1].length
      blocks.push(
        <div key={`h-${idx}`} className={`md-h md-h${level}`}>
          {inline(heading[2], `h-${idx}`)}
        </div>
      )
      return
    }

    blocks.push(
      <p key={`p-${idx}`} className="md-p">{inline(line, `p-${idx}`)}</p>
    )
  })

  flushList()
  return <div className={`md ${className}`}>{blocks}</div>
}
