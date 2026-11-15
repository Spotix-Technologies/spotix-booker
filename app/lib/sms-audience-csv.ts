/**
 * app/lib/sms-audience-csv.ts
 *
 * Spreadsheet import for bulk SMS (CSV export of any sheet). Looks for a
 * header column named phone / number / mobile / tel…; with no recognisable
 * header the first column is used. Values are returned RAW — validation,
 * flagging and dedupe all happen in lib/sms-phone.ts so imported numbers go
 * through exactly the same checks as every other source.
 *
 * Tip surfaced in the UI: Excel drops the leading 0 of phone numbers stored
 * as numbers, so those rows will be flagged as "10 digits".
 */

import Papa from "papaparse"

const HEADER_NAMES = ["phone", "phonenumber", "phone number", "phone_number", "number", "mobile", "mobilenumber", "mobile number", "tel", "telephone", "msisdn", "contact"]

export interface SmsImportResult {
  ok: boolean
  values: string[]
  totalRows: number
  usedHeader: string | null
  error?: string
}

export function parseSmsAudienceCsv(csvText: string): SmsImportResult {
  const parsed = Papa.parse<string[]>(csvText, { header: false, skipEmptyLines: true })
  const rows = (parsed.data || []).filter((r) => Array.isArray(r) && r.some((c) => String(c ?? "").trim() !== ""))
  if (!rows.length) return { ok: false, values: [], totalRows: 0, usedHeader: null, error: "That file is empty" }

  const first = rows[0].map((c) => String(c ?? "").trim().toLowerCase())
  let colIndex = first.findIndex((c) => HEADER_NAMES.includes(c))
  let body = rows

  if (colIndex >= 0) {
    body = rows.slice(1)
  } else {
    colIndex = 0
    // No known header. If the first cell has no digits at all it's almost
    // certainly a header row with an unfamiliar name ("Customer phone no.").
    if (!/\d/.test(first[0] || "")) body = rows.slice(1)
  }

  const values = body.map((r) => String(r[colIndex] ?? "").trim()).filter(Boolean)
  return {
    ok: true,
    values,
    totalRows: body.length,
    usedHeader: colIndex >= 0 && HEADER_NAMES.includes(first[colIndex]) ? first[colIndex] : null,
  }
}
