/**
 * app/lib/sms-phone.ts
 *
 * Client-side phone validation for bulk SMS. spotix-backend runs the exact
 * same rules again (v1/lib/sms/phone.js) before anything is stored — this is
 * only here so the booker sees problems as they build the audience.
 *
 * Rules:
 *   • every number must be 11 digits (0 + 7/8/9 + 9 digits)
 *   • a letter anywhere in a contact is flagged
 *   • "+234" is accepted; after it the number can't start with 0 and must
 *     start with 7, 8 or 9 (it's converted to the 11-digit local form)
 */

export const MAX_RECIPIENTS = 50000
// Keep in sync with MAX_SMS_MESSAGE_LENGTH in spotix-backend/v1/lib/sms/repo.js
export const MAX_SMS_MESSAGE_LENGTH = 480

export type PhoneCheck = { ok: true; number: string } | { ok: false; reason: string }

export function normalizeNigerianNumber(raw: unknown): PhoneCheck {
  const original = String(raw ?? "").trim()
  if (!original) return { ok: false, reason: "Empty number" }

  // Spreadsheets love spaces, dashes and brackets — those aren't errors.
  const s = original.replace(/[\s\-().]/g, "")
  if (!s) return { ok: false, reason: "Empty number" }

  if (/[A-Za-z]/.test(s)) return { ok: false, reason: "Contains a letter" }

  if (s.startsWith("+")) {
    if (!s.startsWith("+234")) return { ok: false, reason: "Only +234 numbers are supported" }
    const rest = s.slice(4)
    if (!/^\d+$/.test(rest)) return { ok: false, reason: "Contains invalid characters" }
    if (rest.startsWith("0")) return { ok: false, reason: "After +234 the number can't start with 0" }
    if (!/^[789]/.test(rest)) return { ok: false, reason: "After +234 the number must start with 7, 8 or 9" }
    if (rest.length !== 10) return { ok: false, reason: `Must have 10 digits after +234 (has ${rest.length})` }
    return { ok: true, number: `0${rest}` }
  }

  if (!/^\d+$/.test(s)) return { ok: false, reason: "Contains invalid characters" }
  if (s.length !== 11) {
    const hint = s.length === 10 && /^[789]/.test(s) ? " — missing the leading 0?" : ""
    return { ok: false, reason: `Must be 11 digits (has ${s.length})${hint}` }
  }
  if (!/^0[789]/.test(s)) return { ok: false, reason: "Must start with 07, 08 or 09" }
  return { ok: true, number: s }
}

export interface FlaggedNumber {
  /** Stable id for React keys / edit & remove. */
  id: string
  value: string
  reason: string
  source: string
}

export interface SourcedNumber {
  value: string
  source: string
}

/**
 * Splits raw sourced values into clean (normalised + deduped) numbers and
 * flagged ones. Dedupe happens on the normalised form, so "+2348012345678"
 * and "08012345678" count once.
 */
export function classifyNumbers(items: SourcedNumber[]): { clean: string[]; flagged: FlaggedNumber[] } {
  const seen = new Set<string>()
  const clean: string[] = []
  const flagged: FlaggedNumber[] = []
  items.forEach((item, i) => {
    const result = normalizeNigerianNumber(item.value)
    if (!result.ok) {
      flagged.push({ id: `${item.source}:${i}:${item.value}`, value: item.value, reason: result.reason, source: item.source })
      return
    }
    if (seen.has(result.number)) return
    seen.add(result.number)
    clean.push(result.number)
  })
  return { clean, flagged }
}
