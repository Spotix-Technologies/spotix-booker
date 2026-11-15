"use client"

/**
 * app/campaign/list/page.tsx
 *
 * Every campaign on the booker's account — email and SMS, across all their
 * events, newest first, each tagged with its type and date. Loads the first 15,
 * then the next 15 whenever the bottom of the list scrolls into view
 * (cursor-based, so a campaign created mid-scroll never shifts the pages).
 * Click a campaign to open its stats: /campaign/{id}?type=email|sms.
 *
 * ?kind=email|sms pre-selects the filter (the dashboard's "View all" links).
 */

import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ArrowLeft, ChevronRight, Loader2, Mail, MessageSquareText, Megaphone } from "lucide-react"
import { authFetch } from "@/lib/auth-client"
import { formatCount } from "@/lib/naira"
import {
  TransactionFilterTabs, formatTxnDate,
  type TxnFilter,
} from "@/components/campaigns/credit-transactions"

const PAGE_SIZE = 15

interface CampaignRow {
  id: string
  type: "email" | "sms"
  name: string
  status: string
  eventId: string | null
  eventName: string | null
  recipients: number
  createdAt: string
}

const STATUS_STYLES: Record<string, string> = {
  // email
  draft: "bg-slate-100 text-slate-600",
  waiting_for_provider: "bg-amber-100 text-amber-700",
  processing: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  completed_with_errors: "bg-amber-100 text-amber-700",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-slate-100 text-slate-500",
  flagged: "bg-red-100 text-red-700",
  pending_review: "bg-blue-100 text-blue-700",
  // sms
  created: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  delivered: "bg-emerald-100 text-emerald-800",
}

function statusLabel(c: CampaignRow): string {
  if (c.type === "sms" && c.status === "created") return "under review"
  return c.status.replace(/_/g, " ")
}

function hrefFor(c: CampaignRow): string {
  // A flagged email campaign is fixed and resubmitted from the create flow.
  if (c.type === "email" && c.status === "flagged") return `/campaign/create?resume=${c.id}`
  return `/campaign/${c.id}?type=${c.type}`
}

function CampaignListContent() {
  const searchParams = useSearchParams()
  const initialKind = searchParams.get("kind")
  const [filter, setFilter] = useState<TxnFilter>(initialKind === "email" || initialKind === "sms" ? initialKind : "all")
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(true)        // first page for the current filter
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // One request at a time; a response that lands after the filter changed (or
  // after a newer request started) is discarded.
  const inFlight = useRef(false)
  const requestId = useRef(0)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const loadPage = useCallback(async (kind: TxnFilter, after: string | null) => {
    if (inFlight.current) return
    inFlight.current = true
    const myRequest = ++requestId.current
    setError(null)
    if (after) setLoadingMore(true)

    try {
      const qs = new URLSearchParams({ kind, limit: String(PAGE_SIZE) })
      if (after) qs.set("cursor", after)
      const res = await authFetch(`/api/campaign-list?${qs.toString()}`)
      const data = await res.json()
      if (myRequest !== requestId.current) return
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to load campaigns")

      const incoming: CampaignRow[] = data.campaigns || []
      setCampaigns((prev) => {
        if (!after) return incoming
        const seen = new Set(prev.map((c) => `${c.type}-${c.id}`))
        return [...prev, ...incoming.filter((c) => !seen.has(`${c.type}-${c.id}`))]
      })
      setCursor(data.nextCursor || null)
      setHasMore(!!data.nextCursor)
    } catch (e: any) {
      if (myRequest !== requestId.current) return
      setError(e?.message || "Failed to load campaigns")
      setHasMore(false) // stop the observer hammering a failing endpoint; "Try again" restarts it
    } finally {
      // Only the latest request may clear the flags, so a stale one finishing
      // late can't unlock the request that replaced it.
      if (myRequest === requestId.current) {
        setLoading(false)
        setLoadingMore(false)
        inFlight.current = false
      }
    }
  }, [])

  // (Re)start from page one whenever the filter changes.
  useEffect(() => {
    requestId.current += 1 // invalidates anything still in flight for the old filter
    inFlight.current = false
    setCampaigns([])
    setCursor(null)
    setHasMore(true)
    setLoading(true)
    loadPage(filter, null)
  }, [filter, loadPage])

  // Infinite scroll: when the sentinel under the list becomes visible, fetch the next page.
  useEffect(() => {
    const node = sentinelRef.current
    if (!node || !hasMore || loading || error) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && cursor) loadPage(filter, cursor)
      },
      { rootMargin: "200px" }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [cursor, hasMore, loading, error, filter, loadPage])

  function retry() {
    setHasMore(true)
    if (campaigns.length === 0) { setLoading(true); loadPage(filter, null) }
    else loadPage(filter, cursor)
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <Link href="/campaign" className="inline-flex items-center gap-1.5 text-sm font-medium text-[#6b2fa5] hover:text-[#5a1f8a] transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Campaigns
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">All campaigns</h1>
            <p className="text-sm text-slate-500">Every email and SMS campaign across your events. Tap one to see its stats.</p>
          </div>
          <TransactionFilterTabs value={filter} onChange={setFilter} />
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="divide-y divide-slate-100 animate-pulse">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center justify-between px-5 py-4">
                  <div className="space-y-2">
                    <div className="h-4 w-44 bg-slate-100 rounded" />
                    <div className="h-3 w-60 bg-slate-100 rounded" />
                  </div>
                  <div className="h-6 w-20 bg-slate-100 rounded-full" />
                </div>
              ))}
            </div>
          ) : campaigns.length === 0 && !error ? (
            <div className="p-12 flex flex-col items-center text-center gap-3">
              <div className="w-14 h-14 rounded-full bg-[#6b2fa5]/10 flex items-center justify-center">
                <Megaphone className="w-7 h-7 text-[#6b2fa5]" />
              </div>
              <p className="text-slate-500 font-medium">
                {filter === "all" ? "No campaigns yet" : `No ${filter === "sms" ? "SMS" : "email"} campaigns yet`}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {campaigns.map((c) => (
                <li key={`${c.type}-${c.id}`}>
                  <Link href={hrefFor(c)} className="flex items-center gap-3 px-5 py-4 hover:bg-slate-50 transition-colors">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${c.type === "email" ? "bg-[#6b2fa5]/10" : "bg-blue-100"}`}>
                      {c.type === "email"
                        ? <Mail className="w-4 h-4 text-[#6b2fa5]" />
                        : <MessageSquareText className="w-4 h-4 text-blue-700" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="font-medium text-slate-900 truncate">{c.name}</p>
                        <span className={`hidden sm:inline-block text-[10px] rounded-full px-2 py-0.5 font-semibold flex-shrink-0 ${c.type === "email" ? "bg-[#6b2fa5]/10 text-[#6b2fa5]" : "bg-blue-100 text-blue-700"}`}>
                          {c.type === "email" ? "Email" : "SMS"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5 truncate">
                        {c.type === "email" ? "Email" : "SMS"}
                        {c.eventName ? ` · ${c.eventName}` : ""}
                        {` · ${formatCount(c.recipients)} ${c.type === "email" ? "recipients" : "numbers"}`}
                        {` · ${formatTxnDate(c.createdAt)}`}
                      </p>
                      {c.type === "email" && c.status === "flagged" && (
                        <p className="text-xs text-red-600 mt-0.5">Needs changes — tap to fix and resubmit</p>
                      )}
                    </div>
                    <span className={`text-xs rounded-full px-3 py-1 font-semibold capitalize flex-shrink-0 ${STATUS_STYLES[c.status] || "bg-slate-100 text-slate-600"}`}>
                      {statusLabel(c)}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {!loading && campaigns.length > 0 && (
            <div className="px-5 py-4 text-center text-xs text-slate-400 border-t border-slate-100">
              {loadingMore ? (
                <span className="inline-flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading more…</span>
              ) : !hasMore && !error ? (
                "You've reached the end"
              ) : null}
            </div>
          )}

          {error && (
            <div className="px-5 py-4 text-center text-sm text-red-600 space-y-2 border-t border-slate-100">
              <p>{error}</p>
              <button onClick={retry} className="font-semibold text-[#6b2fa5] hover:text-[#5a1f8a] underline underline-offset-2">Try again</button>
            </div>
          )}

          <div ref={sentinelRef} className="h-1" aria-hidden />
        </div>
      </div>
    </div>
  )
}

export default function CampaignListPage() {
  return (
    <Suspense fallback={null}>
      <CampaignListContent />
    </Suspense>
  )
}
