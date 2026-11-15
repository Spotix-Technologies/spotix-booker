"use client"

/**
 * app/campaign/page.tsx
 *
 * Campaign dashboard (spec §19–20). Event picker, credit balances,
 * recent campaigns list + a simple Recharts bar chart, empty state.
 * Buy Credits opens BuyCreditsModal (Phase 3's Paystack checkout,
 * spec §18) via ?checkout=1.
 *
 * Email and SMS credits both belong to the booker's account — the event
 * picker only decides which event's campaigns are listed, never which
 * credits are used. "Recent transactions" shows the last 10 credit
 * movements (filterable Email / SMS); /campaign/transactions has the rest.
 *
 * Visually matches the rest of the dashboard (observability, polls,
 * teams): slate-50 page bg, white/slate-200 cards, #6b2fa5 brand
 * purple for the header icon and primary actions.
 */

import { useEffect, useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { PlusCircle, Mail, CreditCard, MessageSquareText } from "lucide-react"
import { authFetch } from "@/lib/auth-client"
import { BuyCreditsModal } from "@/components/campaigns/buy-credits-modal"
import { BuySmsCreditsModal } from "@/components/campaigns/buy-sms-credits-modal"
import { ChooseCampaignTypeDialog } from "@/components/campaigns/choose-campaign-type-dialog"
import { PurchaseReceiptModal } from "@/components/campaigns/purchase-receipt"
import { formatCount } from "@/lib/naira"
import {
  TransactionFilterTabs, TransactionsTable,
  type CreditTransaction, type TxnFilter,
} from "@/components/campaigns/credit-transactions"
import { MeasuredChart } from "@/components/campaigns/measured-chart"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
} from "recharts"

interface EventOption { id: string; eventName: string }
interface Campaign {
  id: string
  name: string
  status: string
  total_recipients: number
  sent_count: number
  delivered_count: number
  opened_count: number
  clicked_count: number
  bounced_count: number
  created_at: string
}
interface Credits { available: number; reserved: number; consumed: number; statistics_enabled?: boolean }
interface SmsCredits { available: number; reserved: number; consumed: number }
interface SmsCampaign {
  id: string
  name: string
  event_id: string
  event_name_snapshot: string
  recipient_count: number
  status: "created" | "approved" | "rejected" | "delivered"
  rejection_reason: string | null
  created_at: string
}
const RECENT_TRANSACTIONS = 10
const RECENT_CAMPAIGNS = 5 // per kind — /campaign/list has the rest

const SMS_STATUS_STYLES: Record<string, string> = {
  created: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  delivered: "bg-emerald-100 text-emerald-800",
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  waiting_for_provider: "bg-amber-100 text-amber-700",
  processing: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  completed_with_errors: "bg-amber-100 text-amber-700",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-slate-100 text-slate-500",
  flagged: "bg-red-100 text-red-700",
  pending_review: "bg-blue-100 text-blue-700",
}

// Mirrors the loaded page's shape (stat cards, bulk-sms card, chart,
// campaign list) so the page doesn't jump around once real content
// lands, and there's no gap where the empty state can flash through.
function CampaignsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
          <div className="h-4 w-24 bg-slate-100 rounded" />
          <div className="h-8 w-32 bg-slate-100 rounded" />
          <div className="h-4 w-28 bg-slate-100 rounded" />
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="h-4 w-40 bg-slate-100 rounded" />
            <div className="h-5 w-32 bg-slate-100 rounded" />
          </div>
          <div className="h-10 w-36 bg-slate-100 rounded-xl flex-shrink-0" />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-slate-100 flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-24 bg-slate-100 rounded" />
          <div className="h-4 w-full max-w-md bg-slate-100 rounded" />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
        <div className="h-4 w-48 bg-slate-100 rounded" />
        <div className="h-56 w-full bg-slate-100 rounded-xl" />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center justify-between px-5 py-4">
            <div className="space-y-2">
              <div className="h-4 w-40 bg-slate-100 rounded" />
              <div className="h-3 w-56 bg-slate-100 rounded" />
            </div>
            <div className="h-6 w-20 bg-slate-100 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

function CampaignDashboard() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [events, setEvents] = useState<EventOption[]>([])
  const [eventId, setEventId] = useState<string>(searchParams.get("eventId") || "")
  const [credits, setCredits] = useState<Credits | null>(null)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [transactions, setTransactions] = useState<CreditTransaction[]>([])
  const [txnFilter, setTxnFilter] = useState<TxnFilter>("all")
  const [txnLoading, setTxnLoading] = useState(true)
  const [loading, setLoading] = useState(true)
  // Tracks the owned-events fetch separately from the per-event data
  // fetch below. Needed so the "no events yet" / "no campaigns yet"
  // states can't render before we actually know the answer — see the
  // eventId effect's comment.
  const [eventsLoading, setEventsLoading] = useState(true)
  const [smsCredits, setSmsCredits] = useState<SmsCredits | null>(null)
  const [smsCampaigns, setSmsCampaigns] = useState<SmsCampaign[]>([])
  const showCheckout = searchParams.get("checkout") === "1"
  const showSmsCheckout = searchParams.get("smsCheckout") === "1"
  // ?ref=… is appended when a credit purchase starts. If the buyer left the
  // browser to pay and this page reloaded, show their receipt instead of a
  // blank page that looks like the payment failed. Captured ONCE from the URL
  // the page loaded with: a ref appended later (live checkout in the buy
  // modal) must not swap the modal out mid-payment.
  const [recoveredRef, setRecoveredRef] = useState<string | null>(() => searchParams.get("ref"))
  const smsJustCreated = searchParams.get("smsCreated") === "1"
  // The single "Create Campaign" button opens this to pick Email vs SMS.
  const [chooseTypeOpen, setChooseTypeOpen] = useState(false)

  // Email credits are account-level: loaded once, not per event.
  function loadEmailCredits() {
    authFetch("/api/campaign-credits")
      .then((r) => r.json())
      .then((data) => { if (data.success) setCredits(data.credits) })
      .catch(() => {})
  }

  // Last 10 credit movements for the chosen filter (Email / SMS / both).
  function loadTransactions(kind: TxnFilter = txnFilter) {
    setTxnLoading(true)
    authFetch(`/api/campaign-transactions?kind=${kind}&limit=${RECENT_TRANSACTIONS}`)
      .then((r) => r.json())
      .then((data) => { if (data.success) setTransactions(data.transactions || []) })
      .catch(() => {})
      .finally(() => setTxnLoading(false))
  }

  function refetchAfterPurchase() {
    loadEmailCredits()
    loadTransactions()
  }

  function loadSms() {
    authFetch("/api/sms/credits")
      .then((r) => r.json())
      .then((data) => { if (data.success) setSmsCredits(data.credits) })
      .catch(() => {})
    authFetch(`/api/sms/campaigns?limit=${RECENT_CAMPAIGNS}`)
      .then((r) => r.json())
      .then((data) => { if (data.success) setSmsCampaigns(data.campaigns || []) })
      .catch(() => {})
  }

  function closeReceipt() {
    setRecoveredRef(null)
    // Drops ref + checkout flags so the buy modals don't reopen behind it.
    router.replace(eventId ? `/campaign?eventId=${eventId}` : "/campaign")
  }

  useEffect(loadSms, [])
  useEffect(loadEmailCredits, [])
  // Refetch whenever the Email / SMS / All tab changes.
  useEffect(() => { loadTransactions(txnFilter) }, [txnFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    authFetch("/api/event/list?action=owned")
      .then((r) => r.json())
      .then((data) => {
        const list: EventOption[] = data.events || []
        setEvents(list)
        if (!eventId && list.length) setEventId(list[0].id)
      })
      .catch(() => {})
      .finally(() => setEventsLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!eventId) {
      // Nothing to show yet doesn't mean "no campaigns" — it might just
      // mean the owned-events fetch above hasn't resolved and picked a
      // default event yet. Only drop out of loading once that fetch has
      // actually finished, so this never renders the empty state (or the
      // "no events" state) while we're still mid-flight and about to get
      // an eventId a moment later. This is what used to let "No
      // campaigns" flash on load.
      if (!eventsLoading) setLoading(false)
      return
    }
    setLoading(true)
    authFetch(`/api/campaigns?eventId=${eventId}&limit=${RECENT_CAMPAIGNS}`)
      .then((r) => r.json())
      .then((campaignsRes) => {
        if (campaignsRes.success) setCampaigns(campaignsRes.campaigns || [])
      })
      .finally(() => setLoading(false))
  }, [eventId, eventsLoading])

  const recentEmail = campaigns.slice(0, RECENT_CAMPAIGNS)
  const recentSms = smsCampaigns.slice(0, RECENT_CAMPAIGNS)
  const chartData = recentEmail.map((c) => ({
    name: c.name,
    Sent: c.sent_count, Delivered: c.delivered_count, Opened: c.opened_count,
    Clicked: c.clicked_count, Bounced: c.bounced_count,
  }))

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Campaigns</h1>
            <p className="text-sm text-slate-500">Email and text your attendees and track performance</p>
          </div>
          {events.length > 0 && (
            <select
              className="text-sm border border-slate-200 rounded-lg px-3 py-2.5 bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-[#6b2fa5]/30 focus:border-[#6b2fa5]"
              value={eventId}
              onChange={(e) => {
                setEventId(e.target.value)
                router.replace(`/campaign?eventId=${e.target.value}`)
              }}
            >
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>{ev.eventName}</option>
              ))}
            </select>
          )}
        </div>

        {loading ? (
          <CampaignsSkeleton />
        ) : !eventId ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <p className="text-slate-500">Create an event first to start a campaign.</p>
          </div>
        ) : (
          <>
            {smsJustCreated && (
              <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
                Your bulk SMS was uploaded and is waiting for review. We&apos;ll email you once it&apos;s approved or rejected.
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <p className="text-sm text-slate-500">Email Credits <span className="text-slate-400">· all your events</span></p>
                <p className="text-3xl font-bold text-slate-900 mt-1">
                  {credits ? formatCount(credits.available) : "—"} <span className="text-base font-normal text-slate-400">available</span>
                </p>
                {credits && credits.reserved > 0 && (
                  <p className="text-xs text-slate-400 mt-1">{formatCount(credits.reserved)} reserved for active campaigns</p>
                )}
                <Link
                  href={`/campaign?eventId=${eventId}&checkout=1`}
                  className="inline-flex items-center gap-1.5 mt-3 text-sm font-semibold text-[#6b2fa5] hover:text-[#5a1f8a] transition-colors"
                >
                  <CreditCard className="w-3.5 h-3.5" /> Buy Credits
                </Link>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-slate-500">Ready to reach your attendees?</p>
                  <p className="text-lg font-semibold text-slate-900 mt-1">Start a new campaign</p>
                </div>
                <button
                  onClick={() => setChooseTypeOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#6b2fa5] text-white px-4 py-2.5 text-sm font-semibold hover:bg-[#5a1f8a] transition-colors flex-shrink-0"
                >
                  <PlusCircle className="w-4 h-4" /> Create Campaign
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-[#6b2fa5]/10 flex items-center justify-center flex-shrink-0">
                    <MessageSquareText className="w-5 h-5 text-[#6b2fa5]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Bulk SMS</p>
                    <p className="text-3xl font-bold text-slate-900 mt-1">
                      {smsCredits ? formatCount(smsCredits.available) : "—"} <span className="text-base font-normal text-slate-400">SMS credits</span>
                    </p>
                    {smsCredits && smsCredits.reserved > 0 && (
                      <p className="text-xs text-slate-400 mt-1">{formatCount(smsCredits.reserved)} reserved for campaigns awaiting delivery</p>
                    )}
                    <Link
                      href={`/campaign?eventId=${eventId}&smsCheckout=1`}
                      className="inline-flex items-center gap-1.5 mt-2 text-sm font-semibold text-[#6b2fa5] hover:text-[#5a1f8a] transition-colors"
                    >
                      <CreditCard className="w-3.5 h-3.5" /> Buy SMS Credits
                    </Link>
                  </div>
                </div>
              </div>

              {recentSms.length > 0 && (
                <div className="border-t border-slate-100">
                  <div className="divide-y divide-slate-100">
                    {recentSms.map((c) => (
                      <Link
                        key={c.id}
                        href={`/campaign/${c.id}?type=sms`}
                        className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900 truncate">{c.name}</p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {c.event_name_snapshot} · {formatCount(c.recipient_count)} numbers · {new Date(c.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <span className={`text-xs rounded-full px-3 py-1 font-semibold capitalize flex-shrink-0 ${SMS_STATUS_STYLES[c.status] || "bg-slate-100 text-slate-600"}`}>
                          {c.status === "created" ? "under review" : c.status}
                        </span>
                      </Link>
                    ))}
                  </div>
                  <Link
                    href="/campaign/list?kind=sms"
                    className="block px-5 py-3 text-xs font-semibold text-[#6b2fa5] hover:text-[#5a1f8a] border-t border-slate-100 transition-colors"
                  >
                    View all SMS campaigns
                  </Link>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 pt-4 pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Recent transactions</p>
                  <p className="text-xs text-slate-400 mt-0.5">Your last {RECENT_TRANSACTIONS} credit movements — shared across all your events</p>
                </div>
                <div className="flex items-center gap-3">
                  <TransactionFilterTabs value={txnFilter} onChange={setTxnFilter} />
                  <Link href="/campaign/transactions" className="text-xs font-semibold text-[#6b2fa5] hover:text-[#5a1f8a] whitespace-nowrap">
                    View all
                  </Link>
                </div>
              </div>
              {txnLoading && transactions.length === 0 ? (
                <div className="px-5 pb-5 space-y-3 animate-pulse">
                  {[0, 1, 2].map((i) => <div key={i} className="h-4 w-full bg-slate-100 rounded" />)}
                </div>
              ) : transactions.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-slate-400">
                  {txnFilter === "all" ? "No credit transactions yet." : `No ${txnFilter === "sms" ? "SMS" : "email"} credit transactions yet.`}
                </p>
              ) : (
                <div className={`max-h-80 overflow-y-auto transition-opacity ${txnLoading ? "opacity-50" : ""}`}>
                  <TransactionsTable transactions={transactions} />
                </div>
              )}
            </div>

            {campaigns.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 flex flex-col items-center text-center gap-3">
                <div className="w-14 h-14 rounded-full bg-[#6b2fa5]/10 flex items-center justify-center">
                  <Mail className="w-7 h-7 text-[#6b2fa5]" />
                </div>
                <p className="text-slate-500 font-medium">No campaigns yet for this event</p>
                <button
                  onClick={() => setChooseTypeOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#6b2fa5] text-white px-4 py-2.5 text-sm font-semibold hover:bg-[#5a1f8a] transition-colors"
                >
                  <PlusCircle className="w-4 h-4" /> Create your first campaign
                </button>
              </div>
            ) : (
              <>
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                  <p className="text-sm font-semibold text-slate-800 mb-3">Recent campaign performance</p>
                  <MeasuredChart height={260}>
                    {(width) => {
                      const maxLabel = width < 420 ? 6 : 14
                      return (
                        <BarChart width={width} height={260} data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                          <XAxis
                            dataKey="name"
                            fontSize={11}
                            stroke="#94a3b8"
                            interval={0}
                            tickLine={false}
                            tickFormatter={(v: string) => (v.length > maxLabel ? `${v.slice(0, maxLabel)}…` : v)}
                          />
                          <YAxis fontSize={12} allowDecimals={false} stroke="#94a3b8" width={32} />
                          <Tooltip />
                          <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: 12 }} />
                          <Bar dataKey="Sent" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="Delivered" fill="#22c55e" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="Opened" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="Clicked" fill="#6b2fa5" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="Bounced" fill="#ef4444" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      )
                    }}
                  </MeasuredChart>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-5 pt-4 pb-3 flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-800">Email campaigns</p>
                    <Link href="/campaign/list?kind=email" className="text-xs font-semibold text-[#6b2fa5] hover:text-[#5a1f8a] whitespace-nowrap">
                      View all
                    </Link>
                  </div>
                  <div className="divide-y divide-slate-100 border-t border-slate-100">
                  {recentEmail.map((c) => (
                    <Link
                      key={c.id}
                      href={c.status === "flagged" ? `/campaign/create?resume=${c.id}` : `/campaign/${c.id}?type=email`}
                      className="flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
                    >
                      <div>
                        <p className="font-medium text-slate-900">{c.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {c.total_recipients.toLocaleString()} recipients · {new Date(c.created_at).toLocaleDateString()}
                        </p>
                        {c.status === "flagged" && (
                          <p className="text-xs text-red-600 mt-0.5">Needs changes — tap to fix and resubmit</p>
                        )}
                      </div>
                      <span className={`text-xs rounded-full px-3 py-1 font-semibold capitalize flex-shrink-0 ${STATUS_STYLES[c.status] || "bg-slate-100 text-slate-600"}`}>
                        {c.status.replace(/_/g, " ")}
                      </span>
                    </Link>
                  ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {chooseTypeOpen && eventId && (
        <ChooseCampaignTypeDialog eventId={eventId} onClose={() => setChooseTypeOpen(false)} />
      )}

      {showCheckout && eventId && !recoveredRef && (
        <BuyCreditsModal
          onClose={() => router.replace(`/campaign?eventId=${eventId}`)}
          onPurchased={refetchAfterPurchase}
        />
      )}

      {showSmsCheckout && !recoveredRef && (
        <BuySmsCreditsModal
          onClose={() => router.replace(`/campaign?eventId=${eventId}`)}
          onPurchased={() => { loadSms(); loadTransactions() }}
        />
      )}

      {/* Receipt for a purchase whose reference is in the URL — i.e. the page
          reloaded while the buyer was paying elsewhere. The buy modals show
          their own receipt; this one is only for a page that loaded with a ref. */}
      {recoveredRef && (
        <PurchaseReceiptModal
          reference={recoveredRef}
          onClose={closeReceipt}
          onSuccessful={() => { refetchAfterPurchase(); loadSms() }}
        />
      )}
    </div>
  )
}

export default function CampaignPage() {
  return (
    <Suspense fallback={null}>
      <CampaignDashboard />
    </Suspense>
  )
}
