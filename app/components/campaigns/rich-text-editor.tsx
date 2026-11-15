"use client"

/**
 * app/components/campaigns/rich-text-editor.tsx
 *
 * Reusable editor for the campaign message body. Two views:
 *   - "Write" (source): a plain textarea where the markup commands
 *     (**bold**, _italic_, --underline--, [text](url), "- " lists,
 *     [center]…[/center]) are typed/edited directly — exactly what
 *     gets stored and sent to the backend as message_text.
 *   - "Preview" (render): shows the formatted output using the same
 *     parser the Design step's live preview uses (campaign-rich-text.ts)
 *     — read-only, commands are not editable here.
 *
 * Toolbar buttons wrap the current textarea selection with the right
 * markers (or insert a placeholder + select it, so typing immediately
 * replaces it if nothing was selected). The Link button opens a small
 * dialog: if text was highlighted, that text becomes the link's display
 * text (read-only in the dialog) and only the URL is asked for; with no
 * selection, both display text and URL are asked for. Either way it
 * inserts `[display](url)` at the cursor.
 *
 * Right-click formatting menu: only intercepts the browser's context
 * menu when there's an actual text selection. With no selection, the
 * native menu (and its spellcheck/autocorrect suggestions, which only
 * ever apply per-word anyway) is left completely alone.
 *
 * This component is intentionally generic — it doesn't know anything
 * about campaigns specifically — so it can be dropped into any page
 * that needs the same rich-text + CTA-label input.
 */

import { useEffect, useRef, useState } from "react"
import type { MouseEvent, KeyboardEvent } from "react"
import {
  Bold, Italic, Underline, Link2, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight, Code2, Eye,
} from "lucide-react"
import { ResponsiveSheet } from "@/components/ui/responsive-sheet"
import { formatMessage } from "@/lib/campaign-rich-text"

interface RichTextEditorProps {
  value: string
  onChange: (value: string) => void
  ctaText: string
  onCtaTextChange: (value: string) => void
  placeholder?: string
  className?: string
}

type Range = { start: number; end: number }

const UL_MARKER_RE = /^-\s/
const OL_MARKER_RE = /^(\d+)\.\s/
const ANY_MARKER_RE = /^(-\s+|\d+\.\s+)/

/** The line containing `pos`, plus where it starts. */
function lineAt(text: string, pos: number) {
  const start = text.lastIndexOf("\n", pos - 1) + 1
  let end = text.indexOf("\n", pos)
  if (end === -1) end = text.length
  return { start, end, line: text.slice(start, end) }
}

function normalizeUrl(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) return ""
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

export default function RichTextEditor({
  value, onChange, ctaText, onCtaTextChange, placeholder, className,
}: RichTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [mode, setMode] = useState<"source" | "render">("source")
  const pendingSelection = useRef<Range | null>(null)

  const [linkDialog, setLinkDialog] = useState<{
    hasSelection: boolean
    displayText: string
    url: string
    range: Range
  } | null>(null)

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)

  // Which list type (if any) the caret's current line belongs to — drives
  // the toolbar's active state for the bullet / numbered list buttons.
  const [activeList, setActiveList] = useState<"ul" | "ol" | null>(null)

  // Shown when a toolbar command is clicked while in Preview.
  const [previewNotice, setPreviewNotice] = useState(false)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // A toolbar action updates `value` via onChange (this is a controlled
  // textarea), which re-renders before we get a chance to touch DOM
  // selection — so the cursor/selection we want has to be restored
  // *after* that render, not inline in the click handler.
  useEffect(() => {
    if (!pendingSelection.current) return
    const el = textareaRef.current
    if (!el) return
    const { start, end } = pendingSelection.current
    pendingSelection.current = null
    el.focus()
    el.setSelectionRange(start, end)
  }, [value])

  function detectList() {
    const el = textareaRef.current
    if (!el) { setActiveList(null); return }
    const { line } = lineAt(el.value, el.selectionStart ?? 0)
    setActiveList(UL_MARKER_RE.test(line) ? "ul" : OL_MARKER_RE.test(line) ? "ol" : null)
  }

  // Re-check after every value change / view switch (the selection was
  // just restored by the effect above, which is declared first).
  useEffect(() => {
    if (mode === "source") detectList()
    else setActiveList(null)
  }, [value, mode]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current) }, [])

  /** Every toolbar command goes through this: in Preview nothing is
   *  applied — the user is told to switch back to Write instead. */
  function command(fn: () => void) {
    if (mode === "render") {
      setPreviewNotice(true)
      if (noticeTimer.current) clearTimeout(noticeTimer.current)
      noticeTimer.current = setTimeout(() => setPreviewNotice(false), 3500)
      return
    }
    fn()
  }

  function applyEdit(newValue: string, selStart: number, selEnd: number) {
    pendingSelection.current = { start: selStart, end: selEnd }
    onChange(newValue)
  }

  function getSelection(): Range {
    const el = textareaRef.current
    if (!el) return { start: value.length, end: value.length }
    return { start: el.selectionStart ?? value.length, end: el.selectionEnd ?? value.length }
  }

  /** Wraps the current selection with before/after markers. With no
   *  selection, inserts before+placeholder+after and selects the
   *  placeholder so typing replaces it right away. */
  function wrapSelection(before: string, after: string, placeholder: string) {
    const { start, end } = getSelection()
    const selected = value.slice(start, end)
    const inner = selected || placeholder
    const newValue = value.slice(0, start) + before + inner + after + value.slice(end)
    const innerStart = start + before.length
    applyEdit(newValue, innerStart, innerStart + inner.length)
  }

  /** Toggles a bullet / numbered list on every line the selection
   *  touches. If they're all already that list type it removes the
   *  markers; another list type is converted; a blank line gets a fresh
   *  marker so the user can just start typing. */
  function applyListPrefix(kind: "ul" | "ol") {
    const { start, end } = getSelection()
    const first = lineAt(value, start)
    const last = lineAt(value, end)
    const lineStart = first.start
    const lineEnd = last.end
    const lines = value.slice(lineStart, lineEnd).split("\n")
    const single = lines.length === 1
    const marker = kind === "ul" ? UL_MARKER_RE : OL_MARKER_RE
    const targets = lines.filter((l) => l.trim() || single)
    const allAlready = targets.length > 0 && targets.every((l) => marker.test(l))

    let n = 1
    const newBlock = lines
      .map((line) => {
        if (!line.trim() && !single) return line
        const stripped = line.replace(ANY_MARKER_RE, "")
        if (allAlready) return stripped
        return kind === "ul" ? `- ${stripped}` : `${n++}. ${stripped}`
      })
      .join("\n")
    const newValue = value.slice(0, lineStart) + newBlock + value.slice(lineEnd)
    const collapsed = start === end
    applyEdit(newValue, collapsed ? lineStart + newBlock.length : lineStart, lineStart + newBlock.length)
  }

  /** Enter inside a list line starts the next item (same marker, next
   *  number for ordered lists). Backspace right after a marker removes
   *  the marker — that's how you leave a list. */
  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.nativeEvent.isComposing) return
    const el = textareaRef.current
    if (!el || el.selectionStart !== el.selectionEnd) return
    const pos = el.selectionStart
    const { start: lineStart, line } = lineAt(value, pos)

    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const ol = OL_MARKER_RE.exec(line)
      const isUl = UL_MARKER_RE.test(line)
      if (!ol && !isUl) return
      // Caret inside the marker itself: let Enter behave normally.
      const markerLen = ol ? ol[0].length : 2
      if (pos - lineStart < markerLen) return
      e.preventDefault()
      const next = ol ? `${parseInt(ol[1], 10) + 1}. ` : "- "
      const insert = `\n${next}`
      applyEdit(value.slice(0, pos) + insert + value.slice(pos), pos + insert.length, pos + insert.length)
      return
    }

    if (e.key === "Backspace" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const beforeCaret = value.slice(lineStart, pos)
      if (/^(-\s+|\d+\.\s+)$/.test(beforeCaret)) {
        e.preventDefault()
        applyEdit(value.slice(0, lineStart) + value.slice(pos), lineStart, lineStart)
      }
    }
  }

  /** Wraps the selected lines in an alignment block tag. */
  function applyAlign(align: "left" | "center" | "right") {
    const { start, end } = getSelection()
    const lineStart = value.lastIndexOf("\n", start - 1) + 1
    let lineEnd = value.indexOf("\n", end)
    if (lineEnd === -1) lineEnd = value.length
    const block = value.slice(lineStart, lineEnd)
    const wrapped = `[${align}]\n${block}\n[/${align}]`
    const newValue = value.slice(0, lineStart) + wrapped + value.slice(lineEnd)
    applyEdit(newValue, lineStart, lineStart + wrapped.length)
  }

  function openLinkDialog() {
    const { start, end } = getSelection()
    const selected = value.slice(start, end)
    setLinkDialog({ hasSelection: selected.length > 0, displayText: selected, url: "", range: { start, end } })
  }

  function confirmLink() {
    if (!linkDialog) return
    const url = normalizeUrl(linkDialog.url)
    if (!url) return
    const text = linkDialog.hasSelection ? linkDialog.displayText : (linkDialog.displayText.trim() || "Learn more")
    const { start, end } = linkDialog.range
    const markup = `[${text}](${url})`
    const newValue = value.slice(0, start) + markup + value.slice(end)
    applyEdit(newValue, start + markup.length, start + markup.length)
    setLinkDialog(null)
  }

  function handleContextMenu(e: MouseEvent<HTMLTextAreaElement>) {
    const { start, end } = getSelection()
    // Only take over when text is actually selected. With no selection,
    // let the browser's own context menu through untouched so native
    // spellcheck/autocorrect suggestions keep working normally — those
    // only ever apply to the word under the cursor, never to a range,
    // so there's no real overlap with what our menu offers anyway.
    if (start === end) return
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY })
  }

  useEffect(() => {
    if (!ctxMenu) return
    const close = () => setCtxMenu(null)
    window.addEventListener("click", close)
    window.addEventListener("scroll", close, true)
    return () => {
      window.removeEventListener("click", close)
      window.removeEventListener("scroll", close, true)
    }
  }, [ctxMenu])

  const dim = mode === "render" ? " opacity-50" : ""
  const toolbarBtn = `p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors${dim}`
  const toolbarBtnActive = `p-1.5 rounded-md bg-[#6b2fa5]/10 text-[#6b2fa5] transition-colors${dim}`
  const divider = <span className="w-px h-4 bg-slate-200 mx-1" />

  return (
    <div className={`rounded-lg border border-slate-200 bg-white overflow-hidden ${className || ""}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap border-b border-slate-100 px-2 py-1.5 bg-slate-50">
        <div className="flex items-center gap-0.5 flex-wrap">
          <button type="button" title="Bold (**text**)" className={toolbarBtn} onClick={() => command(() => wrapSelection("**", "**", "bold text"))}>
            <Bold className="w-4 h-4" />
          </button>
          <button type="button" title="Italic (_text_)" className={toolbarBtn} onClick={() => command(() => wrapSelection("_", "_", "italic text"))}>
            <Italic className="w-4 h-4" />
          </button>
          <button type="button" title="Underline (--text--)" className={toolbarBtn} onClick={() => command(() => wrapSelection("--", "--", "underlined text"))}>
            <Underline className="w-4 h-4" />
          </button>
          <button type="button" title="Add link" className={toolbarBtn} onClick={() => command(openLinkDialog)}>
            <Link2 className="w-4 h-4" />
          </button>
          {divider}
          <button type="button" title="Bullet list" aria-pressed={activeList === "ul"} className={activeList === "ul" ? toolbarBtnActive : toolbarBtn} onClick={() => command(() => applyListPrefix("ul"))}>
            <List className="w-4 h-4" />
          </button>
          <button type="button" title="Numbered list" aria-pressed={activeList === "ol"} className={activeList === "ol" ? toolbarBtnActive : toolbarBtn} onClick={() => command(() => applyListPrefix("ol"))}>
            <ListOrdered className="w-4 h-4" />
          </button>
          {divider}
          <button type="button" title="Align left" className={toolbarBtn} onClick={() => command(() => applyAlign("left"))}>
            <AlignLeft className="w-4 h-4" />
          </button>
          <button type="button" title="Align center" className={toolbarBtn} onClick={() => command(() => applyAlign("center"))}>
            <AlignCenter className="w-4 h-4" />
          </button>
          <button type="button" title="Align right" className={toolbarBtn} onClick={() => command(() => applyAlign("right"))}>
            <AlignRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center rounded-md border border-slate-200 bg-white p-0.5 text-xs font-semibold flex-shrink-0">
          <button
            type="button"
            onClick={() => setMode("source")}
            className={`flex items-center gap-1 px-2 py-1 rounded ${mode === "source" ? "bg-[#6b2fa5] text-white" : "text-slate-500 hover:text-slate-800"}`}
          >
            <Code2 className="w-3.5 h-3.5" /> Write
          </button>
          <button
            type="button"
            onClick={() => setMode("render")}
            className={`flex items-center gap-1 px-2 py-1 rounded ${mode === "render" ? "bg-[#6b2fa5] text-white" : "text-slate-500 hover:text-slate-800"}`}
          >
            <Eye className="w-3.5 h-3.5" /> Preview
          </button>
        </div>
      </div>

      {previewNotice && (
        <div role="status" className="px-3 py-2 text-xs font-medium text-amber-800 bg-amber-50 border-b border-amber-200">
          You&apos;re in Preview. Switch back to <strong>Write</strong> to edit the email.
        </div>
      )}

      {mode === "source" ? (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onContextMenu={handleContextMenu}
          onKeyDown={handleKeyDown}
          onSelect={detectList}
          onClick={detectList}
          placeholder={placeholder}
          spellCheck
          className="w-full min-h-32 px-3 py-2.5 text-sm text-slate-900 focus:outline-none resize-y font-mono"
        />
      ) : (
        <div
          className="w-full min-h-32 px-3 py-2.5 text-sm text-slate-800"
          dangerouslySetInnerHTML={{
            __html: value.trim()
              ? formatMessage(value)
              : '<p style="color:#9ca3af;margin:0;">Nothing to preview yet…</p>',
          }}
        />
      )}

      <div className="flex items-center gap-2 border-t border-slate-100 px-3 py-2 bg-slate-50">
        <label className="text-xs font-semibold text-slate-500 flex-shrink-0">Button text</label>
        <input
          type="text"
          value={ctaText}
          onChange={(e) => onCtaTextChange(e.target.value)}
          placeholder="View Event"
          maxLength={40}
          className="flex-1 min-w-0 border border-slate-200 rounded-md px-2 py-1 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#6b2fa5]/30 focus:border-[#6b2fa5]"
        />
      </div>

      <p className="px-3 py-1.5 text-[11px] text-slate-400 bg-slate-50 border-t border-slate-100">
        **bold** &nbsp;·&nbsp; _italic_ &nbsp;·&nbsp; --underline-- &nbsp;·&nbsp; [text](url) &nbsp;·&nbsp; "- " for a list &nbsp;·&nbsp; [center]…[/center] to align
      </p>

      {ctxMenu && (
        <div
          className="fixed z-50 rounded-lg border border-slate-200 bg-white shadow-lg py-1 text-sm min-w-[9rem]"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-slate-50 text-left" onClick={() => { wrapSelection("**", "**", ""); setCtxMenu(null) }}>
            <Bold className="w-3.5 h-3.5" /> Bold
          </button>
          <button className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-slate-50 text-left" onClick={() => { wrapSelection("_", "_", ""); setCtxMenu(null) }}>
            <Italic className="w-3.5 h-3.5" /> Italic
          </button>
          <button className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-slate-50 text-left" onClick={() => { wrapSelection("--", "--", ""); setCtxMenu(null) }}>
            <Underline className="w-3.5 h-3.5" /> Underline
          </button>
          <button className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-slate-50 text-left" onClick={() => { setCtxMenu(null); openLinkDialog() }}>
            <Link2 className="w-3.5 h-3.5" /> Add link
          </button>
        </div>
      )}

      {linkDialog && (
        <ResponsiveSheet
          open
          onClose={() => setLinkDialog(null)}
          size="sm"
          zIndex={70}
          title="Add link"
          bodyClassName="px-5 py-4"
          footer={
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button onClick={() => setLinkDialog(null)} className="px-4 py-2.5 text-sm font-semibold text-slate-500 hover:text-slate-700">
                Cancel
              </button>
              <button
                onClick={confirmLink}
                disabled={!linkDialog.url.trim()}
                className="px-4 py-2.5 text-sm font-semibold rounded-xl bg-[#6b2fa5] text-white hover:bg-[#5a1f8a] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Insert
              </button>
            </div>
          }
        >
          <div className="space-y-3">
            {linkDialog.hasSelection ? (
              <div>
                <label className="text-xs font-semibold text-slate-500">Display text</label>
                <p className="mt-1 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5 break-words">
                  {linkDialog.displayText}
                </p>
              </div>
            ) : (
              <div>
                <label className="text-xs font-semibold text-slate-500">Display text</label>
                <input
                  autoFocus
                  type="text"
                  value={linkDialog.displayText}
                  onChange={(e) => setLinkDialog({ ...linkDialog, displayText: e.target.value })}
                  placeholder="e.g. Get your tickets"
                  className="mt-1 w-full border border-slate-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#6b2fa5]/30 focus:border-[#6b2fa5]"
                />
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-slate-500">Link URL</label>
              <input
                autoFocus={linkDialog.hasSelection}
                type="text"
                value={linkDialog.url}
                onChange={(e) => setLinkDialog({ ...linkDialog, url: e.target.value })}
                placeholder="https://example.com"
                onKeyDown={(e) => { if (e.key === "Enter") confirmLink() }}
                className="mt-1 w-full border border-slate-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#6b2fa5]/30 focus:border-[#6b2fa5]"
              />
            </div>
          </div>
        </ResponsiveSheet>
      )}
    </div>
  )
}
