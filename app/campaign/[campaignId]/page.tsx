"use client"

/**
 * app/campaign/[campaignId]/page.tsx
 *
 * Campaign detail (spec §21/§36). Phase 1: static snapshot of status +
 * counters on load. Live progress updates and the recipient-level
 * /stats view (spec §37) land once Phase 2's delivery worker and
 * webhooks exist to actually move these numbers.
 *
 * One URL, two kinds of campaign: /campaign/{id}?type=email (the default,
 * so older links keep working) or /campaign/{id}?type=sms, which renders the
 * bulk SMS view (components/campaigns/sms-campaign-detail.tsx).
 */

import { useEffect, useRef, useState, Suspense } from "react"
import { useParams, useSearchParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Mail, PartyPopper, Copy } from "lucide-react"
import confetti from "canvas-confetti"
import { authFetch } from "@/lib/auth-client"
import { dicebearAvatarUrl } from "@/lib/dicebear"
import RecipientLedgerSheet from "@/components/campaigns/recipient-ledger-sheet"
import { SmsCampaignDetail } from "@/components/campaigns/sms-campaign-detail"
import { MeasuredChart } from "@/components/campaigns/measured-chart"
import {
  BarChart, Bar, Cell, XAxis, YAxis, Tooltip,
} from "recharts"

interface CampaignDetail {
  id: string; name: string; status: string; sender_email: string; event_id: string
  total_recipients: number; sent_count: number; delivered_count: number
  opened_count: number; clicked_count: number; bounced_count: number
  failed_count: number; credits_reserved: number; credits_consumed: number
  moderation_reason?: string | null; moderation_suggestion?: string | null
}

interface Recipient {
  id: string; email: string; name: string | null; status: string
  sent_at: string | null; delivered_at: string | null
}

const STATUS_COPY: Record<string, string> = {
  draft: "Draft — not yet started",
  waiting_for_provider: "Queued — the campaign will resume soon",
  processing: "Sending",
  completed: "Completed",
  completed_with_errors: "Completed with some errors",
  failed: "Failed",
  cancelled: "Cancelled",
  flagged: "Needs changes — not sent",
  pending_review: "Under review — we'll email you if anything needs fixing",
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

const RECIPIENT_STATUS_STYLES: Record<string, string> = {
  pending: "bg-slate-100 text-slate-500",
  sending: "bg-slate-100 text-slate-500",
  sent: "bg-blue-100 text-blue-700",
  delivered: "bg-green-100 text-green-700",
  opened: "bg-emerald-100 text-emerald-700",
  clicked: "bg-emerald-100 text-emerald-700",
  bounced: "bg-red-100 text-red-700",
  failed: "bg-red-100 text-red-700",
  complained: "bg-red-100 text-red-700",
}

// Mirrors the loaded page's shape (header card, stat grid, analytics
// card, recipients table) so there's no jump — and nothing that could
// briefly render as "Campaign not found" — while the two fetches below
// are still in flight.
function CampaignDetailSkeleton() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 animate-pulse">
        <div className="h-4 w-36 bg-slate-200 rounded" />

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-slate-100 flex-shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-5 w-48 bg-slate-100 rounded" />
              <div className="h-4 w-56 bg-slate-100 rounded" />
              <div className="h-5 w-28 bg-slate-100 rounded-full" />
            </div>
            <div className="h-9 w-20 bg-slate-100 rounded-xl flex-shrink-0" />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-2">
              <div className="h-3 w-16 bg-slate-100 rounded" />
              <div className="h-6 w-12 bg-slate-100 rounded" />
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="h-4 w-24 bg-slate-100 rounded" />
          <div className="h-56 w-full bg-slate-100 rounded-xl" />
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3">
              <div className="w-7 h-7 rounded-full bg-slate-100 flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-40 bg-slate-100 rounded" />
              </div>
              <div className="h-5 w-16 bg-slate-100 rounded-full flex-shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function EmailCampaignDetail({ campaignId }: { campaignId: string }) {
  const searchParams = useSearchParams()
  const justCreated = searchParams.get("justCreated") === "1"
  const inReview = searchParams.get("review") === "1"
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [ledgerRecipient, setLedgerRecipient] = useState<Recipient | null>(null)
  const firedConfetti = useRef(false)

  useEffect(() => {
    authFetch(`/api/campaigns/${campaignId}`)
      .then((r) => r.json())
      .then((data) => { if (data.success) setCampaign(data.campaign) })
      .finally(() => setLoading(false))
  }, [campaignId])

  useEffect(() => {
    authFetch(`/api/campaigns/${campaignId}/recipients`)
      .then((r) => r.json())
      .then((data) => { if (data.success) setRecipients(data.recipients || []) })
      .catch(() => {})
  }, [campaignId])

  useEffect(() => {
    if (!justCreated || firedConfetti.current) return
    firedConfetti.current = true
    confetti({
      particleCount: 150,
      spread: 90,
      startVelocity: 35,
      origin: { y: 0.6 },
      colors: ["#6b2fa5", "#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe"],
    })
  }, [justCreated])

  if (loading) {
    return <CampaignDetailSkeleton />
  }

  if (!campaign) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Link
            href="/campaign"
            className="inline-flex items-center gap-2 text-[#6b2fa5] hover:text-[#5a1f8a] mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Back to Campaigns</span>
          </Link>
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500">
            Campaign not found.
          </div>
        </div>
      </div>
    )
  }

  const stats = [
    ["Recipients", campaign.total_recipients],
    ["Sent", campaign.sent_count],
    ["Delivered", campaign.delivered_count],
    ["Opened", campaign.opened_count],
    ["Clicked", campaign.clicked_count],
    ["Bounced", campaign.bounced_count],
    ["Failed", campaign.failed_count],
  ] as const

  // Analytics are included with every credits package now — no
  // entitlement check needed, every booker sees the full breakdown.
  const chartData = [
    { name: "Sent", value: campaign.sent_count, color: "#94a3b8" },
    { name: "Delivered", value: campaign.delivered_count, color: "#22c55e" },
    { name: "Opened", value: campaign.opened_count, color: "#3b82f6" },
    { name: "Clicked", value: campaign.clicked_count, color: "#6b2fa5" },
    { name: "Bounced", value: campaign.bounced_count, color: "#ef4444" },
    { name: "Failed", value: campaign.failed_count, color: "#f97316" },
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <Link
          href="/campaign"
          className="inline-flex items-center gap-2 text-[#6b2fa5] hover:text-[#5a1f8a] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-medium">Back to Campaigns</span>
        </Link>

        {justCreated && (
          <div className="flex items-center gap-2 rounded-xl border border-[#6b2fa5]/20 bg-[#6b2fa5]/5 px-4 py-3 text-sm font-medium text-[#6b2fa5]">
            <PartyPopper className="w-4 h-4 shrink-0" />
            {inReview
              ? "Our system will just check your mail for a quick audit before delivering the campaign. If we find anything, we'll shoot you an email — otherwise we'll start your campaign."
              : "Your campaign will start in a moment."}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-[#6b2fa5]/10 rounded-xl flex items-center justify-center flex-shrink-0">
              <Mail className="w-6 h-6 text-[#6b2fa5]" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold text-slate-900 truncate">{campaign.name}</h1>
              <p className="text-sm text-slate-500 mt-0.5">From {campaign.sender_email}</p>
              <span className={`inline-block mt-2 text-xs rounded-full px-3 py-1 font-semibold ${STATUS_STYLES[campaign.status] || "bg-slate-100 text-slate-600"}`}>
                {STATUS_COPY[campaign.status] || campaign.status}
              </span>
            </div>
            <Link
              href={`/campaign/create?cloneFrom=${campaign.id}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 text-slate-600 px-3 py-2 text-sm font-semibold hover:bg-slate-50 hover:text-[#6b2fa5] transition-colors flex-shrink-0"
              title="Start a new campaign with this one's recipients, template and message pre-filled"
            >
              <Copy className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Clone</span>
            </Link>
          </div>
        </div>

        {campaign.status === "flagged" && (
          <div className="rounded-xl border border-red-200 bg-red-50 text-red-900 text-sm p-4 space-y-1">
            <p className="font-semibold">This campaign wasn&apos;t sent.</p>
            <p>{campaign.moderation_reason || "Our system flagged this campaign."}</p>
            {campaign.moderation_suggestion && (
              <p><strong>How to fix it:</strong> {campaign.moderation_suggestion}</p>
            )}
            <p className="text-red-700">No credits were used. Your audience and details are saved.</p>
            <Link
              href={`/campaign/create?resume=${campaign.id}`}
              className="inline-block mt-2 rounded-lg bg-[#6b2fa5] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#5a1f8a]"
            >
              Fix and resubmit
            </Link>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {stats.map(([label, value]) => (
            <div key={label} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="text-xl font-bold text-slate-900 mt-1">{value.toLocaleString()}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <p className="text-sm font-semibold text-slate-800">Analytics</p>
          <MeasuredChart height={220} className="mt-3">
            {(width) => (
              <BarChart width={width} height={220} data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="name" fontSize={width < 420 ? 10 : 12} stroke="#94a3b8" interval={0} tickLine={false} />
                <YAxis fontSize={12} allowDecimals={false} stroke="#94a3b8" width={32} />
                <Tooltip />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                </Bar>
              </BarChart>
            )}
          </MeasuredChart>

          <p className="text-xs text-slate-400 mt-3">
            Analytics after delivered is not 100% accurate.{" "}
            <a href="#" className="underline hover:text-slate-600 transition-colors">Here's why?</a>
          </p>
        </div>

        {recipients.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 pt-4 pb-3">
              <p className="text-sm font-semibold text-slate-800">Recipients</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {recipients.length.toLocaleString()}{recipients.length >= 500 ? "+" : ""} email{recipients.length === 1 ? "" : "s"} in this campaign
              </p>
            </div>
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500 border-y border-slate-200">
                  <tr>
                    <th className="text-left font-medium px-5 py-2"></th>
                    <th className="text-left font-medium px-5 py-2">Email</th>
                    <th className="text-left font-medium px-5 py-2">Status</th>
                    <th className="text-left font-medium px-5 py-2">Delivered</th>
                    <th className="text-left font-medium px-5 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recipients.map((r) => (
                    <tr key={r.id}>
                      <td className="px-5 py-2 w-9">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={dicebearAvatarUrl(r.email, { size: 28 })}
                          alt=""
                          className="w-7 h-7 rounded-full bg-slate-100"
                        />
                      </td>
                      <td className="px-5 py-2 text-slate-700 truncate max-w-[220px]">{r.email}</td>
                      <td className="px-5 py-2">
                        <span className={`inline-block text-xs rounded-full px-2.5 py-0.5 font-semibold ${RECIPIENT_STATUS_STYLES[r.status] || "bg-slate-100 text-slate-500"}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-5 py-2 text-slate-400 text-xs">
                        {r.delivered_at ? new Date(r.delivered_at).toLocaleString() : "—"}
                      </td>
                      <td className="px-5 py-2 text-right">
                        <button
                          onClick={() => setLedgerRecipient(r)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[#6b2fa5] hover:text-[#5a1f8a] border border-[#6b2fa5]/20 rounded-lg px-2 py-1 transition-colors"
                        >
                          Ledger
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <RecipientLedgerSheet
        open={!!ledgerRecipient}
        campaignId={campaignId}
        recipient={ledgerRecipient}
        onClose={() => setLedgerRecipient(null)}
      />
    </div>
  )
}

function CampaignDetailContent() {
  const { campaignId } = useParams<{ campaignId: string }>()
  const type = useSearchParams().get("type")
  return type === "sms"
    ? <SmsCampaignDetail campaignId={campaignId} />
    : <EmailCampaignDetail campaignId={campaignId} />
}

export default function CampaignDetailPage() {
  return (
    <Suspense fallback={null}>
      <CampaignDetailContent />
    </Suspense>
  )
}
