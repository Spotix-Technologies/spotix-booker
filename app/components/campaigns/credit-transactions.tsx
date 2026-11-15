"use client"

/**
 * app/components/campaigns/credit-transactions.tsx
 *
 * Shared pieces for showing a booker's credit movements (email + SMS):
 * the filter tabs and the table. Used by the dashboard's "Recent
 * transactions" card and by /campaign/transactions.
 *
 * Credit value colours:  green = added, red = deducted, yellow = reserved.
 */

import { formatCount } from "@/lib/naira"

export type TxnKind = "email" | "sms"
export type TxnFilter = "all" | TxnKind
export type TxnDirection = "added" | "deducted" | "reserved"
export type TxnType = "purchase" | "used" | "manual" | "refund" | "free"

export interface CreditTransaction {
  id: string
  kind: TxnKind
  txnType: TxnType
  direction: TxnDirection
  credits: number
  reference: string | null
  reason: string | null
  eventId: string | null
  campaignId: string | null
  createdAt: string
}

const FILTERS: { value: TxnFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
]

const VALUE_STYLES: Record<TxnDirection, string> = {
  added: "bg-green-100 text-green-700",
  deducted: "bg-red-100 text-red-700",
  reserved: "bg-yellow-100 text-yellow-800",
}

const TYPE_LABELS: Record<TxnType, string> = {
  purchase: "Purchase",
  used: "Used",
  manual: "Manual",
  refund: "Refund",
  free: "Free credit",
}

export function formatTxnDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("en-NG", {
    day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
  })
}

export function TransactionFilterTabs({ value, onChange }: {
  value: TxnFilter
  onChange: (next: TxnFilter) => void
}) {
  return (
    <div className="inline-flex rounded-lg bg-slate-100 p-0.5" role="tablist" aria-label="Filter transactions">
      {FILTERS.map((f) => (
        <button
          key={f.value}
          role="tab"
          aria-selected={value === f.value}
          onClick={() => onChange(f.value)}
          className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
            value === f.value ? "bg-white text-[#6b2fa5] shadow-sm" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  )
}

export function CreditValue({ direction, credits }: { direction: TxnDirection; credits: number }) {
  const sign = direction === "added" ? "+" : direction === "deducted" ? "−" : ""
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${VALUE_STYLES[direction]}`}>
      {sign}{formatCount(credits)}
      {direction === "reserved" && <span className="font-medium opacity-80">reserved</span>}
    </span>
  )
}

export function TransactionsTable({ transactions }: { transactions: CreditTransaction[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500 border-y border-slate-200">
          <tr>
            <th className="text-left font-medium px-5 py-2 whitespace-nowrap">Date</th>
            <th className="text-left font-medium px-5 py-2 whitespace-nowrap">Campaign</th>
            <th className="text-left font-medium px-5 py-2 whitespace-nowrap">Credits</th>
            <th className="text-left font-medium px-5 py-2 whitespace-nowrap">Type</th>
            <th className="text-left font-medium px-5 py-2 whitespace-nowrap">Txn ID</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {transactions.map((t) => (
            <tr key={`${t.kind}-${t.id}`}>
              <td className="px-5 py-2.5 text-slate-600 text-xs whitespace-nowrap">{formatTxnDate(t.createdAt)}</td>
              <td className="px-5 py-2.5">
                <span className={`inline-block text-xs rounded-full px-2.5 py-0.5 font-semibold ${
                  t.kind === "email" ? "bg-[#6b2fa5]/10 text-[#6b2fa5]" : "bg-blue-100 text-blue-700"
                }`}>
                  {t.kind === "email" ? "Email" : "SMS"}
                </span>
              </td>
              <td className="px-5 py-2.5"><CreditValue direction={t.direction} credits={t.credits} /></td>
              <td className="px-5 py-2.5 text-slate-700 text-xs font-medium whitespace-nowrap" title={t.reason || undefined}>
                {TYPE_LABELS[t.txnType] || t.txnType}
              </td>
              <td className="px-5 py-2.5 text-slate-500 text-xs font-mono whitespace-nowrap">{t.reference || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
