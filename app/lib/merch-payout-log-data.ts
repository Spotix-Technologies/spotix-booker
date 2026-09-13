/**
 * app/lib/merch-payout-log-data.ts
 *
 * Fetch + shape a merch listing's payout history — same DisplayRecord
 * shape lib/payout-log-data.ts uses for events, so the same
 * displayRecordToReceipt() / ReceiptModal can render a merch receipt
 * unmodified. No Vault merge here: listings have no collaborator system
 * and therefore no Vault-hold concept to fold in.
 */

import type { DisplayRecord, DisplayStatus } from "./payout-log-data"

export async function fetchMerchPayoutLogRecords(listingId: string): Promise<DisplayRecord[]> {
  const res = await fetch(`/api/listings/${listingId}/payout?action=status`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || "Failed to fetch payout logs")

  const records: DisplayRecord[] = (data.payouts ?? []).map((p: any) => ({
    id: p.reference,
    source: "payout" as const,
    date: p.date,
    amount: p.amount,
    bankName: p.bankName,
    accountNumber: p.accountNumber,
    accountName: p.accountName,
    status: p.status as DisplayStatus,
    failureReason: p.failureReason,
    narration: p.narration,
    userId: "",
    createdAt: p.createdAt,
    resolvedAt: p.resolvedAt,
    durationSeconds: p.durationSeconds,
  }))

  return records.sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0
    return bTime - aTime
  })
}
