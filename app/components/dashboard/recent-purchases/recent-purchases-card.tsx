"use client"

import { Ticket, ShoppingBag, Vote, Landmark, Receipt } from "lucide-react"
import type { RecentPurchase, PurchaseKind } from "@/lib/recent-purchases"

const KIND_ICON: Record<PurchaseKind, typeof Ticket> = {
  ticket: Ticket,
  merch: ShoppingBag,
  vote: Vote,
  election: Landmark,
}

// One uniform brand color for every purchase kind — the icon shape is what
// distinguishes ticket/merch/vote/election, not the color.
const ICON_STYLE = "bg-[#6b2fa5]/10 text-[#6b2fa5]"

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

export function RecentPurchasesCard({
  purchases,
  loading,
}: {
  purchases: RecentPurchase[]
  loading?: boolean
}) {
  return (
    <div>
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Recent Purchases</p>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-5 space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : purchases.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-6">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
              <Receipt size={20} className="text-slate-300" />
            </div>
            <p className="font-semibold text-slate-600 text-sm">No purchases yet</p>
            <p className="text-xs text-slate-400 mt-1">
              Sales across events, polls, merch and elections show up here
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {purchases.map((p) => {
              const Icon = KIND_ICON[p.kind]
              return (
                <li key={p.id} className="flex items-center gap-3 px-5 py-3.5">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${ICON_STYLE}`}
                  >
                    <Icon size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-800 leading-snug truncate">{p.message}</p>
                  </div>
                  <span className="text-xs text-slate-400 flex-shrink-0 whitespace-nowrap">
                    {timeAgo(p.occurredAt)}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
