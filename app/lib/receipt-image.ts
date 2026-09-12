/**
 * app/lib/receipt-image.ts
 *
 * Renders a single successful payout as a branded PNG "receipt" card,
 * entirely client-side via <canvas> — no server round-trip, and no new
 * dependency (html2canvas/dom-to-image aren't in package.json, and
 * pulling one in just for a single static card is overkill next to
 * drawing it directly).
 *
 * Used from both:
 *   - payouts-tab.tsx's TxnCard ("Transaction Days" view)
 *   - payout-log.tsx ("Payout Logs" view)
 * which is why displayRecordToReceipt() below converts the shared
 * DisplayRecord shape (see payout-log-data.ts) into ReceiptData rather
 * than each call site building its own — one conversion, one drawing
 * routine, so the two views can never render receipts that disagree.
 */

import type { DisplayRecord } from "./payout-log-data"

export interface ReceiptData {
  eventName: string
  reference: string
  amount: number
  status: string
  /** The sales day this payout covers (DisplayRecord.date), e.g. "2025-01-05". */
  payoutDate: string
  /** ISO string — when the payout actually completed (DisplayRecord.resolvedAt). */
  completedAt: string | null
  /** ISO string — when the payout request was submitted, shown only as a fallback. */
  submittedAt?: string | null
  bankName?: string
  accountName?: string
  accountNumber?: string
}

/** Converts a merged payout-log record (see payout-log-data.ts) into
 *  receipt input — the one place that mapping happens, so both call
 *  sites stay in sync. */
export function displayRecordToReceipt(record: DisplayRecord, eventName: string): ReceiptData {
  return {
    eventName,
    reference: record.id,
    amount: record.amount,
    status: record.status,
    payoutDate: record.date,
    completedAt: record.resolvedAt ?? null,
    submittedAt: record.createdAt ?? null,
    bankName: record.bankName,
    accountName: record.accountName,
    accountNumber: record.accountNumber,
  }
}

const LOGO_SRC = "/full-logo.png"
const BRAND = "#6b2fa5"
const INK = "#111827"
const MUTED = "#6b7280"
const BORDER = "#e5e7eb"
const GREEN = "#16a34a"

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load ${src}`))
    img.src = src
  })
}

function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })
}

function maskAccountNumber(accountNumber: string): string {
  const last4 = accountNumber.slice(-4)
  return `•••• ${last4}`
}

/**
 * Draws the receipt onto an offscreen canvas at 2x scale (crisp on
 * retina displays without a huge file size) and returns it — the
 * caller decides whether to preview it (canvas.toDataURL) or download
 * it (canvas.toBlob).
 */
export async function buildReceiptCanvas(data: ReceiptData): Promise<HTMLCanvasElement> {
  const W = 600
  const H = 840
  const SCALE = 2

  const canvas = document.createElement("canvas")
  canvas.width = W * SCALE
  canvas.height = H * SCALE
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas 2D context unavailable")
  ctx.scale(SCALE, SCALE)

  // ── Page background ──
  ctx.fillStyle = "#f3f4f6"
  ctx.fillRect(0, 0, W, H)

  // ── Card ──
  const margin = 24
  const cardX = margin
  const cardY = margin
  const cardW = W - margin * 2
  const cardH = H - margin * 2

  ctx.save()
  roundedRectPath(ctx, cardX, cardY, cardW, cardH, 18)
  ctx.clip()
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(cardX, cardY, cardW, cardH)

  // ── Header band ──
  const headerH = 110
  ctx.fillStyle = BRAND
  ctx.fillRect(cardX, cardY, cardW, headerH)

  try {
    const logo = await loadImage(LOGO_SRC)
    const logoH = 30
    const logoW = (logo.width / logo.height) * logoH
    ctx.drawImage(logo, cardX + 28, cardY + 24, logoW, logoH)
  } catch {
    // Logo failed to load (e.g. offline) — fall back to a text wordmark
    // rather than leaving a blank header.
    ctx.fillStyle = "#ffffff"
    ctx.font = "700 20px system-ui, sans-serif"
    ctx.fillText("Spotix", cardX + 28, cardY + 48)
  }

  ctx.fillStyle = "rgba(255,255,255,0.85)"
  ctx.font = "600 12px system-ui, sans-serif"
  ctx.fillText("PAYOUT RECEIPT", cardX + 28, cardY + 82)

  ctx.restore() // release the card clip — everything below draws unclipped

  let y = cardY + headerH + 34

  // ── Status pill ──
  const isSuccess = data.status === "successful"
  const pillLabel = isSuccess ? "Successful" : data.status.replace(/_/g, " ")
  ctx.font = "600 12px system-ui, sans-serif"
  const pillTextW = ctx.measureText(pillLabel).width
  const pillPadX = 12
  const pillW = pillTextW + pillPadX * 2
  const pillH = 24
  roundedRectPath(ctx, cardX + 28, y, pillW, pillH, pillH / 2)
  ctx.fillStyle = isSuccess ? "#dcfce7" : "#f3f4f6"
  ctx.fill()
  ctx.fillStyle = isSuccess ? GREEN : MUTED
  ctx.textBaseline = "middle"
  ctx.fillText(pillLabel, cardX + 28 + pillPadX, y + pillH / 2 + 1)
  ctx.textBaseline = "alphabetic"

  y += pillH + 30

  // ── Amount ──
  ctx.fillStyle = MUTED
  ctx.font = "700 11px system-ui, sans-serif"
  ctx.fillText("AMOUNT PAID OUT", cardX + 28, y)
  ctx.fillStyle = INK
  ctx.font = "700 36px system-ui, sans-serif"
  ctx.fillText(`₦${Math.round(data.amount).toLocaleString()}`, cardX + 28, y + 42)
  y += 42 + 30

  // ── Divider ──
  ctx.strokeStyle = BORDER
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(cardX + 28, y)
  ctx.lineTo(cardX + cardW - 28, y)
  ctx.stroke()
  y += 30

  // ── Key/value rows ──
  const row = (label: string, value: string) => {
    ctx.fillStyle = MUTED
    ctx.font = "700 10.5px system-ui, sans-serif"
    ctx.fillText(label.toUpperCase(), cardX + 28, y)
    ctx.fillStyle = INK
    ctx.font = "600 14.5px system-ui, sans-serif"
    ctx.fillText(value, cardX + 28, y + 19)
    y += 19 + 24
  }

  row("Event", data.eventName)
  row("Transaction Reference", data.reference)
  row("Payout Date", data.payoutDate)
  row(
    "Completed",
    data.completedAt
      ? fmtDateTime(data.completedAt)
      : data.submittedAt
      ? `${fmtDateTime(data.submittedAt)} (submitted)`
      : "—"
  )
  if (data.bankName) row("Bank", data.bankName)
  if (data.accountName) row("Account Name", data.accountName)
  if (data.accountNumber) row("Account Number", maskAccountNumber(data.accountNumber))

  // ── Footer ──
  const footerY = cardY + cardH - 54
  ctx.strokeStyle = BORDER
  ctx.beginPath()
  ctx.moveTo(cardX + 28, footerY)
  ctx.lineTo(cardX + cardW - 28, footerY)
  ctx.stroke()

  ctx.fillStyle = MUTED
  ctx.font = "11px system-ui, sans-serif"
  ctx.fillText(`Generated ${fmtDateTime(new Date().toISOString())}`, cardX + 28, footerY + 22)
  ctx.fillText("Spotix Technologies", cardX + 28, footerY + 38)

  return canvas
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error("Failed to encode receipt image"))
    }, "image/png")
  })
}

/** Builds the receipt and immediately triggers a PNG download. */
export async function downloadReceiptImage(data: ReceiptData): Promise<void> {
  const canvas = await buildReceiptCanvas(data)
  const blob = await canvasToBlob(canvas)
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `spotix-receipt-${data.reference || "payout"}.png`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
