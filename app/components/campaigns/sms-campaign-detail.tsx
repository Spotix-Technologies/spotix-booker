"use client"

/**
 * app/components/campaigns/sms-campaign-detail.tsx
 *
 * The SMS half of /campaign/[campaignId]?type=sms. Shows the campaign, what
 * happened to its credits, a timeline built from the append-only
 * sms_campaign_events ledger (created → approved/rejected → delivered, each with
 * its exact date and time), and lets the booker download the numbers they
 * uploaded — whatever the status.
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Download, Loader2, MessageSquareText, RotateCcw } from "lucide-react"
import { authFetch } from "@/lib/auth-client"
import { formatCount } from "@/lib/naira"
import { formatTxnDate } from "@/components/campaigns/credit-transactions"

interface SmsCampaign {
  id: string
  name: string
  event_name_snapshot: string
  message_text: string
  recipient_count: number
  credits_reserved: number
  status: "created" | "approved" | "rejected" | "delivered"
  rejection_reason: string | null
  created_at: string
}
interface TimelineEvent {
  id: number
  type: "created" | "approved" | "rejected" | "delivered"
  at: string
  note: string | null
}

const STATUS_STYLES: Record<SmsCampaign["status"], string> = {
  created: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  delivered: "bg-emerald-100 text-emerald-800",
}
const STATUS_COPY: Record<SmsCampaign["status"], string> = {
  created: "Under review",
  approved: "Approved — waiting to be sent",
  rejected: "Rejected",
  delivered: "Delivered",
}
const EVENT_COPY: Record<TimelineEvent["type"], string> = {
  created: "Submitted for review",
  approved: "Approved",
  rejected: "Rejected",
  delivered: "Delivered",
}
const DOT_STYLES: Record<TimelineEvent["type"], string> = {
  created: "bg-blue-500",
  approved: "bg-green-500",
  rejected: "bg-red-500",
  delivered: "bg-emerald-600",
}
const NEXT_STEP: Partial<Record<SmsCampaign["status"], string>> = {
  created: "Waiting for review — we'll email you when it's approved or rejected.",
  approved: "Approved — it will be marked delivered once the messages have gone out.",
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <Link href="/campaign" className="inline-flex items-center gap-2 text-[#6b2fa5] hover:text-[#5a1f8a] transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-medium">Back to Campaigns</span>
        </Link>
        {children}
      </div>
    </div>
  )
}

export function SmsCampaignDetail({ campaignId }: { campaignId: string }) {
  const [campaign, setCampaign] = useState<SmsCampaign | null>(null)
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    authFetch(`/api/sms/campaigns/${campaignId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setCampaign(data.campaign)
          setTimeline(data.timeline || [])
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [campaignId])

  async function downloadNumbers() {
    setDownloading(true)
    setDownloadError(null)
    try {
      const res = await authFetch(`/api/sms/campaigns/${campaignId}/numbers?download=1`)
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${(campaign?.name || "sms-campaign").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-numbers.txt`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      setDownloadError("Couldn't download the numbers. Please try again.")
    } finally {
      setDownloading(false)
    }
  }

  if (loading) {
    return (
      <Shell>
        <div className="space-y-6 animate-pulse">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-slate-100 flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-5 w-48 bg-slate-100 rounded" />
              <div className="h-4 w-40 bg-slate-100 rounded" />
              <div className="h-5 w-28 bg-slate-100 rounded-full" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[0, 1].map((i) => <div key={i} className="h-20 bg-white rounded-2xl border border-slate-200" />)}
          </div>
          <div className="h-56 bg-white rounded-2xl border border-slate-200" />
        </div>
      </Shell>
    )
  }

  if (!campaign) {
    return (
      <Shell>
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500">Campaign not found.</div>
      </Shell>
    )
  }

  const creditLabel =
    campaign.status === "delivered" ? "Credits used"
      : campaign.status === "rejected" ? "Credits returned"
      : "Credits reserved"

  return (
    <Shell>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-[#6b2fa5]/10 rounded-xl flex items-center justify-center flex-shrink-0">
            <MessageSquareText className="w-6 h-6 text-[#6b2fa5]" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-slate-900 truncate">{campaign.name}</h1>
            <p className="text-sm text-slate-500 mt-0.5">Bulk SMS · {campaign.event_name_snapshot}</p>
            <span className={`inline-block mt-2 text-xs rounded-full px-3 py-1 font-semibold ${STATUS_STYLES[campaign.status]}`}>
              {STATUS_COPY[campaign.status]}
            </span>
          </div>
        </div>
      </div>

      {campaign.status === "rejected" && (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-900 text-sm p-4 space-y-1.5">
          <p><strong>Why it was rejected:</strong> {campaign.rejection_reason || "No reason was provided."}</p>
          <p className="text-red-800/80 text-xs">The credits reserved for it were returned to you.</p>
          <Link
            href={`/campaign/sms/create?resendFrom=${campaign.id}`}
            className="inline-flex items-center gap-1.5 mt-1 rounded-lg bg-[#6b2fa5] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#5a1f8a] transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Edit &amp; send again
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <p className="text-xs text-slate-500">Phone numbers</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{formatCount(campaign.recipient_count)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <p className="text-xs text-slate-500">{creditLabel}</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{formatCount(campaign.credits_reserved)}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-2">
        <p className="text-sm font-semibold text-slate-800">Message</p>
        <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">{campaign.message_text}</p>
        <p className="text-xs text-slate-400">{campaign.message_text.length} characters</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <p className="text-sm font-semibold text-slate-800">Timeline</p>
        <ol className="mt-4">
          {timeline.map((e, i) => {
            const last = i === timeline.length - 1 && !NEXT_STEP[campaign.status]
            return (
              <li key={e.id} className="relative pl-7 pb-5 last:pb-0">
                {!last && <span className="absolute left-[5px] top-3 bottom-0 w-px bg-slate-200" aria-hidden />}
                <span className={`absolute left-0 top-1.5 w-[11px] h-[11px] rounded-full ring-4 ring-white ${DOT_STYLES[e.type]}`} aria-hidden />
                <p className="text-sm font-medium text-slate-900">{EVENT_COPY[e.type]}</p>
                <p className="text-xs text-slate-400 mt-0.5">{formatTxnDate(e.at)}</p>
                {e.type === "rejected" && e.note && <p className="text-xs text-slate-600 mt-1">{e.note}</p>}
              </li>
            )
          })}
          {NEXT_STEP[campaign.status] && (
            <li className="relative pl-7">
              <span className="absolute left-0 top-1.5 w-[11px] h-[11px] rounded-full border-2 border-slate-300 bg-white ring-4 ring-white" aria-hidden />
              <p className="text-xs text-slate-400 mt-0.5">{NEXT_STEP[campaign.status]}</p>
            </li>
          )}
        </ol>
        {timeline.length === 0 && <p className="text-sm text-slate-400 mt-3">No activity recorded yet.</p>}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">Phone numbers</p>
          <p className="text-xs text-slate-400 mt-0.5">The {formatCount(campaign.recipient_count)} numbers you uploaded, as a .txt file with one number per line.</p>
          {downloadError && <p className="text-xs text-red-600 mt-1">{downloadError}</p>}
        </div>
        <button
          onClick={downloadNumbers}
          disabled={downloading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 text-slate-700 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 hover:text-[#6b2fa5] transition-colors disabled:opacity-60 flex-shrink-0"
        >
          {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Download numbers
        </button>
      </div>
    </Shell>
  )
}
