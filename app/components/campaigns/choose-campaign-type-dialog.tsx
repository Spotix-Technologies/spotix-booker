"use client"

/**
 * app/components/campaigns/choose-campaign-type-dialog.tsx
 *
 * The single "Create Campaign" entry point on /campaign. Asks which kind of
 * campaign to start — Email or SMS — then sends the booker to the matching
 * wizard for the selected event:
 *   • Email → /campaign/create?eventId=…
 *   • SMS   → /campaign/sms/create?eventId=…
 *
 * The two icons are static assets served from /public (email.svg, sms.svg).
 *
 * Built on ResponsiveSheet (bottom sheet on phones, right drawer on desktop).
 */

import Link from "next/link"
import { ResponsiveSheet } from "@/components/ui/responsive-sheet"

const OPTIONS = [
  {
    key: "email",
    title: "Email",
    description: "Design a branded email and send it to your attendees' inboxes.",
    icon: "/email.svg",
    href: (eventId: string) => `/campaign/create?eventId=${encodeURIComponent(eventId)}`,
  },
  {
    key: "sms",
    title: "SMS",
    description: "Send a plain text message to phone numbers of your attendees.",
    icon: "/sms.svg",
    href: (eventId: string) => `/campaign/sms/create?eventId=${encodeURIComponent(eventId)}`,
  },
] as const

export function ChooseCampaignTypeDialog({ eventId, onClose }: {
  eventId: string
  onClose: () => void
}) {
  return (
    <ResponsiveSheet
      open
      onClose={onClose}
      size="md"
      title="Create a campaign"
      description="How would you like to reach your attendees?"
      bodyClassName="p-5"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {OPTIONS.map((o) => (
          <Link
            key={o.key}
            href={o.href(eventId)}
            className="group flex flex-col items-center text-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 transition-all hover:border-[#6b2fa5] hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6b2fa5]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={o.icon} alt="" className="w-20 h-20 object-contain" />
            <div>
              <p className="text-base font-semibold text-slate-900 group-hover:text-[#6b2fa5] transition-colors">{o.title}</p>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{o.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </ResponsiveSheet>
  )
}
