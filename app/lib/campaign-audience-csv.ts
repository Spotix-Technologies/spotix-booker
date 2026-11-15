/**
 * app/lib/campaign-audience-csv.ts
 *
 * Mode C: external mailing-list import (spec §24, §58). Mirrors
 * election-voters-csv.ts's shape (papaparse, header row, per-row
 * validation instead of all-or-nothing) rather than introducing a
 * different CSV convention.
 *
 * Required columns only: name, email (spec §24 — "do not require
 * additional columns").
 */

import Papa from "papaparse"

export interface ImportedRecipient { name: string | null; email: string }
export interface ImportResult {
  ok: boolean
  recipients: ImportedRecipient[]
  totalRows: number
  invalidRows: number
  duplicatesRemoved: number
  errors: string[]
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function parseAndValidateAudienceCsv(csvText: string): ImportResult {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  })

  const fields = parsed.meta.fields || []
  if (!fields.includes("email")) {
    return { ok: false, recipients: [], totalRows: 0, invalidRows: 0, duplicatesRemoved: 0, errors: ['Missing required "email" column'] }
  }

  const totalRows = parsed.data.length
  let invalidRows = 0
  const seen = new Map<string, ImportedRecipient>()

  for (const row of parsed.data) {
    const email = (row.email || "").trim().toLowerCase()
    if (!email || !EMAIL_RE.test(email)) { invalidRows += 1; continue }
    if (!seen.has(email)) {
      seen.set(email, { email, name: row.name ? row.name.trim() : null })
    }
  }

  const recipients = Array.from(seen.values())
  const duplicatesRemoved = totalRows - invalidRows - recipients.length

  return {
    ok: true,
    recipients,
    totalRows,
    invalidRows,
    duplicatesRemoved: Math.max(duplicatesRemoved, 0),
    errors: [],
  }
}
