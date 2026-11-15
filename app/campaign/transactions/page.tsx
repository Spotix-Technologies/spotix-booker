"use client"

/**
 * app/campaign/transactions/page.tsx
 *
 * Every email + SMS credit movement on the booker's account — purchases,
 * credits used / reserved / returned, admin top-ups. Filter by Email, SMS or
 * both. Loads the first 25, then the next 25 each time the bottom of the list
 * scrolls into view (cursor-based, so new activity never shifts the pages).
 */

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Loader2, Receipt } from "lucide-react"
import { authFetch } from "@/lib/auth-client"
import {
  TransactionFilterTabs, TransactionsTable,
  type CreditTransaction, type TxnFilter,
} from "@/components/campaigns/credit-transactions"

const PAGE_SIZE = 25

export default function CampaignTransactionsPage() {
  const [filter, setFilter] = useState<TxnFilter>("all")
  const [transactions, setTransactions] = useState<CreditTransaction[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(true)       // first page for the current filter
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Guards: one request at a time, and a response that arrives after the
  // filter changed (or after a newer request started) is thrown away.
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
      const res = await authFetch(`/api/campaign-transactions?${qs.toString()}`)
      const data = await res.json()
      if (myRequest !== requestId.current) return
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to load transactions")

      const incoming: CreditTransaction[] = data.transactions || []
      setTransactions((prev) => {
        if (!after) return incoming
        const seen = new Set(prev.map((t) => `${t.kind}-${t.id}`))
        return [...prev, ...incoming.filter((t) => !seen.has(`${t.kind}-${t.id}`))]
      })
      setCursor(data.nextCursor || null)
      setHasMore(!!data.nextCursor)
    } catch (e: any) {
      if (myRequest !== requestId.current) return
      setError(e?.message || "Failed to load transactions")
      setHasMore(false) // stop the observer hammering a failing endpoint; Retry restarts it
    } finally {
      // Only the latest request may clear the flags — a stale one finishing
      // late must not unlock (or flip loading off for) the request that
      // replaced it.
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
    setTransactions([])
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
    if (transactions.length === 0) { setLoading(true); loadPage(filter, null) }
    else loadPage(filter, cursor)
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <Link href="/campaign" className="inline-flex items-center gap-1.5 text-sm font-medium text-[#6b2fa5] hover:text-[#5a1f8a] transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Campaigns
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Credit transactions</h1>
            <p className="text-sm text-slate-500">Every email and SMS credit purchase, top-up and use on your account</p>
          </div>
          <TransactionFilterTabs value={filter} onChange={setFilter} />
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="divide-y divide-slate-100 animate-pulse">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-6 px-5 py-4">
                  <div className="h-3 w-28 bg-slate-100 rounded" />
                  <div className="h-5 w-14 bg-slate-100 rounded-full" />
                  <div className="h-5 w-16 bg-slate-100 rounded-full" />
                  <div className="h-3 w-16 bg-slate-100 rounded" />
                  <div className="h-3 w-40 bg-slate-100 rounded" />
                </div>
              ))}
            </div>
          ) : transactions.length === 0 && !error ? (
            <div className="p-12 flex flex-col items-center text-center gap-3">
              <div className="w-14 h-14 rounded-full bg-[#6b2fa5]/10 flex items-center justify-center">
                <Receipt className="w-7 h-7 text-[#6b2fa5]" />
              </div>
              <p className="text-slate-500 font-medium">
                {filter === "all" ? "No credit transactions yet" : `No ${filter === "sms" ? "SMS" : "email"} credit transactions yet`}
              </p>
            </div>
          ) : (
            <TransactionsTable transactions={transactions} />
          )}

          {!loading && transactions.length > 0 && (
            <div className="px-5 py-4 text-center text-xs text-slate-400">
              {loadingMore ? (
                <span className="inline-flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading more…</span>
              ) : !hasMore && !error ? (
                "You've reached the end"
              ) : null}
            </div>
          )}

          {error && (
            <div className="px-5 py-4 text-center text-sm text-red-600 space-y-2">
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
