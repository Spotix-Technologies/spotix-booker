/** ₦1,234.50 — always two decimals, so VAT/total lines (₦6.75, ₦456.75) read correctly. */
export function formatNaira(value: number | null | undefined): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return "₦0.00"
  return `₦${n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** 1,234 — safe against undefined/NaN (the Buy Credits crash came from calling toLocaleString on undefined). */
export function formatCount(value: number | null | undefined): string {
  const n = Number(value)
  return Number.isFinite(n) ? n.toLocaleString("en-NG") : "0"
}
