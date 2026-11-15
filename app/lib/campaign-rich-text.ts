/**
 * app/lib/campaign-rich-text.ts
 *
 * Hand-mirrors spotix-backend's v1/lib/campaigns/rich-text.js so the
 * Design step's live preview (and the RichTextEditor's Preview tab)
 * render instantly in the browser — no round trip for something that's
 * pure string templating with zero Node-only dependencies. See that
 * file's header comment for the full syntax reference; kept identical
 * here on purpose:
 *
 *   **bold** · _italic_ · --underline-- · [text](https://url)
 *   "- item" lines → bullet list · "1. item" lines → numbered list
 *   [center]...[/center] / [right]...[/right] / [left]...[/left]
 *   blank line → paragraph break · single newline → <br/>
 *
 * IMPORTANT: this is preview-only. The actual send always goes through
 * the backend's renderCampaignEmailHtml — that stays the single source
 * of truth for what recipients receive. There's no shared package
 * between the two repos, so if rich-text.js changes, this needs
 * updating by hand to match, or the live preview will drift.
 */

export function escapeHtml(str: string) {
  return String(str || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

const ALIGN_RE = /\[(center|right|left)\]([\s\S]*?)\[\/\1\]/g
const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g
const BOLD_RE = /\*\*(.+?)\*\*/g
const UNDERLINE_RE = /--(.+?)--/g
const ITALIC_RE = /_(.+?)_/g
const UL_LINE_RE = /^-\s+(.*)$/
const OL_LINE_RE = /^\d+\.\s+(.*)$/

function styleSpans(text: string) {
  return text
    .replace(BOLD_RE, "<strong>$1</strong>")
    .replace(UNDERLINE_RE, '<span style="text-decoration:underline;">$1</span>')
    .replace(ITALIC_RE, "<em>$1</em>")
}

function inlineFormat(text: string) {
  // Links are pulled out into placeholders first so bold/italic/
  // underline markers inside a URL (e.g. https://x.com/a_b_c) can't be
  // misread as formatting and corrupt the href.
  const links: string[] = []
  const withTokens = text.replace(LINK_RE, (_m, label: string, url: string) => {
    links.push(`<a href="${url}" style="color:inherit;text-decoration:underline;">${styleSpans(label)}</a>`)
    return `\u0000${links.length - 1}\u0000`
  })
  return styleSpans(withTokens).replace(/\u0000(\d+)\u0000/g, (_m, i: string) => links[Number(i)])
}

function renderBlock(segment: string) {
  const lines = segment.split("\n")
  let html = ""
  let paraBuf: string[] = []
  let listBuf: string[] = []
  let listType: "ul" | "ol" | null = null

  function flushPara() {
    const text = paraBuf.join("\n").trim()
    paraBuf = []
    if (!text) return
    html += `<p style="margin:0 0 14px;">${inlineFormat(text).replace(/\n/g, "<br/>")}</p>`
  }

  function flushList() {
    if (!listBuf.length) return
    const items = listBuf.map((item) => `<li style="margin:0 0 6px;">${inlineFormat(item)}</li>`).join("")
    html += listType === "ol"
      ? `<ol style="margin:0 0 14px;padding-left:20px;">${items}</ol>`
      : `<ul style="margin:0 0 14px;padding-left:20px;">${items}</ul>`
    listBuf = []
    listType = null
  }

  for (const line of lines) {
    const ulMatch = UL_LINE_RE.exec(line)
    const olMatch = !ulMatch ? OL_LINE_RE.exec(line) : null

    if (ulMatch) {
      if (paraBuf.length) flushPara()
      if (listType && listType !== "ul") flushList()
      listType = "ul"
      listBuf.push(ulMatch[1])
    } else if (olMatch) {
      if (paraBuf.length) flushPara()
      if (listType && listType !== "ol") flushList()
      listType = "ol"
      listBuf.push(olMatch[1])
    } else if (line.trim() === "") {
      if (listType) flushList()
      flushPara()
    } else {
      if (listType) flushList()
      paraBuf.push(line)
    }
  }
  flushList()
  flushPara()
  return html
}

function renderWithAlignment(text: string) {
  let html = ""
  let lastIndex = 0
  let match: RegExpExecArray | null
  ALIGN_RE.lastIndex = 0
  while ((match = ALIGN_RE.exec(text))) {
    html += renderBlock(text.slice(lastIndex, match.index))
    const align = match[1]
    const inner = renderBlock(match[2])
    html += `<div style="text-align:${align};">${inner}</div>`
    lastIndex = ALIGN_RE.lastIndex
  }
  html += renderBlock(text.slice(lastIndex))
  return html
}

/** Plain text only, in from the organizer — escape first, then apply
 *  the safe markup subset described above. */
export function formatMessage(messageText: string) {
  const escaped = escapeHtml(messageText)
  return renderWithAlignment(escaped)
}
