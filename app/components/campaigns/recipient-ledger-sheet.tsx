"use client"

/**
 * app/components/campaigns/recipient-ledger-sheet.tsx
 *
 * Responsive sheet/drawer (ResponsiveSheet) showing one recipient's complete,
 * immutable event history for a campaign — sentAt/deliveredAt/openedAt/
 * clickedAt/delayedAt/bouncedAt/failedAt, and which specific link each
 * click was for.
 *
 * Backed by GET /api/campaigns/{campaignId}/recipients/{recipientId}/ledger,
 * which just reads back the append-only email_events rows for that
 * recipient — nothing here computes anything, it's a straight timeline.
 */

import { useEffect, useState } from "react"
import { Mail, MailCheck, MailOpen, MousePointerClick, Clock, AlertTriangle, Ban, Send } from "lucide-react"
import { ResponsiveSheet } from "@/components/ui/responsive-sheet"
import { authFetch } from "@/lib/auth-client"
import { dicebearAvatarUrl } from "@/lib/dicebear"

interface LedgerEvent {
  event_type: string
  event_timestamp: string
  provider: string
  link_url: string | null
}

interface RecipientSummary {
  id: string
  email: string
  name: string | null
}

interface RecipientLedgerSheetProps {
  open: boolean
  campaignId: string
  recipient: RecipientSummary | null
  onClose: () => void
}

const EVENT_META: Record<string, { label: string; icon: any; className: string }> = {
  sent: { label: "Sent", icon: Send, className: "text-blue-600 bg-blue-100" },
  delivered: { label: "Delivered", icon: MailCheck, className: "text-green-600 bg-green-100" },
  opened: { label: "Opened", icon: MailOpen, className: "text-emerald-600 bg-emerald-100" },
  clicked: { label: "Clicked", icon: MousePointerClick, className: "text-[#6b2fa5] bg-[#6b2fa5]/10" },
  delayed: { label: "Delayed", icon: Clock, className: "text-amber-600 bg-amber-100" },
  bounced: { label: "Bounced", icon: AlertTriangle, className: "text-red-600 bg-red-100" },
  failed: { label: "Failed", icon: AlertTriangle, className: "text-red-600 bg-red-100" },
  complained: { label: "Marked as spam", icon: Ban, className: "text-red-600 bg-red-100" },
}

function describeLink(url: string | null): string | null {
  if (!url) return null
  try {
    const path = new URL(url).pathname
    if (/\/unsubscribe(\/|$)/.test(path)) return "Unsubscribe link"
  } catch {}
  return "Event link"
}

export default function RecipientLedgerSheet({ open, campaignId, recipient, onClose }: RecipientLedgerSheetProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [events, setEvents] = useState<LedgerEvent[]>([])

  useEffect(() => {
    if (!open || !recipient) return
    setLoading(true)
    setError(null)
    setEvents([])
    authFetch(`/api/campaigns/${campaignId}/recipients/${recipient.id}/ledger`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setEvents(data.events || [])
        else setError(data.error || "Couldn't load this recipient's ledger")
      })
      .catch(() => setError("Couldn't load this recipient's ledger"))
      .finally(() => setLoading(false))
  }, [open, recipient, campaignId])

  return (
    <ResponsiveSheet
      open={open && !!recipient}
      onClose={onClose}
      size="md"
      title={<span className="block truncate">{recipient?.name || recipient?.email}</span>}
      description={recipient?.name ? <span className="block truncate">{recipient.email}</span> : undefined}
      icon={
        recipient ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={dicebearAvatarUrl(recipient.email, { size: 40 })}
            alt=""
            className="w-10 h-10 rounded-full bg-slate-100 flex-shrink-0"
          />
        ) : undefined
      }
    >
      <div className="space-y-4">
        {loading && (
          <div className="py-10 text-center text-sm text-slate-400">Loading ledger…</div>
        )}

        {!loading && error && (
          <div className="py-10 text-center text-sm text-red-600">{error}</div>
        )}

        {!loading && !error && events.length === 0 && (
          <div className="py-10 text-center">
            <Mail className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No ledger records for this email on this campaign.</p>
          </div>
        )}

        {!loading && !error && events.length > 0 && (
          <ol className="relative border-l border-slate-200 ml-4 space-y-5 pt-1">
            {events.map((ev, i) => {
              const meta = EVENT_META[ev.event_type] || { label: ev.event_type, icon: Mail, className: "text-slate-600 bg-slate-100" }
              const Icon = meta.icon
              const linkLabel = ev.event_type === "clicked" ? describeLink(ev.link_url) : null
              return (
                <li key={i} className="ml-5 relative">
                  <span className={`absolute -left-[29px] top-0.5 w-6 h-6 rounded-full flex items-center justify-center ${meta.className}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                  <p className="text-sm font-semibold text-slate-800">{meta.label}</p>
                  <p className="text-xs text-slate-400">{new Date(ev.event_timestamp).toLocaleString()} · via {ev.provider === "ses" ? "SES" : "Resend"}</p>
                  {linkLabel && ev.link_url && (
                    <p className="text-xs text-slate-500 mt-0.5 truncate" title={ev.link_url}>{linkLabel}: <span className="underline">{ev.link_url}</span></p>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </ResponsiveSheet>
  )
}
