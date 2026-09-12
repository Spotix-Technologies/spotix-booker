"use client"

import React, { useState, useEffect, useRef } from "react"
import { Copy, Check, Link2, Download, ExternalLink, Sparkles } from "lucide-react"
import QRCodeStyling from "qr-code-styling"
import CreateEventSlug from "./create-event-slug"

interface EventLinkTabProps {
  eventId: string
  /** null/undefined for an event created before the short-link feature —
   *  that's what triggers the "create one now" nudge below. */
  eventSlug?: string | null
}

const SPOTIX_USER_BASE = process.env.NEXT_PUBLIC_SPOTIX_USER || process.env.NEXT_PUBLIC_APP_URL || ""

const EventLinkTab: React.FC<EventLinkTabProps> = ({ eventId, eventSlug: initialEventSlug }) => {
  const [copied, setCopied] = useState(false)
  const [eventSlug, setEventSlug] = useState(initialEventSlug || "")
  const [showCreateSlug, setShowCreateSlug] = useState(false)
  const qrCodeRef = useRef<HTMLDivElement>(null)
  const qrCodeInstance = useRef<any>(null)

  // Stay in sync if the parent's event data arrives/refreshes after mount
  // (the tab can render from a skeleton before eventData is loaded).
  useEffect(() => {
    setEventSlug(initialEventSlug || "")
  }, [initialEventSlug])

  // Falls back to eventId until a slug exists — old links keep working
  // either way, this is purely which one gets shown/shared going forward.
  const eventUrl = `${process.env.NEXT_PUBLIC_APP_URL}/event/${eventSlug || eventId}`

  useEffect(() => {
    if (!qrCodeRef.current) return

    if (!qrCodeInstance.current) {
      qrCodeInstance.current = new QRCodeStyling({
        width: 300,
        height: 300,
        data: eventUrl,
        margin: 10,
        image: "/full-logo.png",
        qrOptions: {
          typeNumber: 0,
          mode: "Byte",
          errorCorrectionLevel: "H",
        },
        imageOptions: {
          hideBackgroundDots: true,
          imageSize: 0.35,
          margin: 8,
          crossOrigin: "anonymous",
        },
        dotsOptions: {
          color: "#6b2fa5",
          type: "rounded",
        },
        backgroundOptions: {
          color: "#ffffff",
        },
        cornersSquareOptions: {
          color: "#6b2fa5",
          type: "extra-rounded",
        },
        cornersDotOptions: {
          color: "#6b2fa5",
          type: "dot",
        },
      })
      qrCodeInstance.current.append(qrCodeRef.current)
    } else {
      // Slug got created after the QR code was first rendered — re-point it
      // at the new (now slug-based) URL instead of leaving it stale.
      qrCodeInstance.current.update({ data: eventUrl })
    }
  }, [eventUrl])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(eventUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error("Failed to copy link:", error)
    }
  }

  const handleDownloadQR = () => {
    qrCodeInstance.current?.download({
      name: `spotix-event-${eventSlug || eventId}-qr`,
      extension: "png",
    })
  }

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Event Link & QR Code</h2>
        <p className="text-slate-500 mt-1 text-sm">Share your event link or let attendees scan the QR code</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Shortlink Card */}
        <div className="bg-white rounded-xl border-2 border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#6b2fa5]/10 rounded-lg">
              <Link2 size={20} className="text-[#6b2fa5]" />
            </div>
            <h3 className="text-base font-semibold text-slate-900">Event Link</h3>
          </div>

          {/* Nudge to create a short link — only shown for events that
              predate the eventSlug feature (item 1). */}
          {!eventSlug && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
              <Sparkles size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs text-amber-800 leading-relaxed">
                  Spotix now supports short links for easier link sharing. Looks like your event
                  doesn&apos;t have one yet. No biggie, create one now.
                </p>
                <button
                  onClick={() => setShowCreateSlug(true)}
                  className="mt-2 text-xs font-semibold text-[#6b2fa5] hover:underline"
                >
                  Create your short link
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl px-4 py-3">
            <a
              href={eventUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 text-sm font-mono text-[#6b2fa5] font-medium hover:underline break-all flex items-center gap-2"
            >
              {eventUrl}
              <ExternalLink size={13} className="shrink-0" />
            </a>
          </div>

          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm rounded-xl border border-slate-200 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
          >
            {copied ? (
              <>
                <Check size={16} className="text-green-600" />
                <span className="text-green-600">Copied!</span>
              </>
            ) : (
              <>
                <Copy size={16} />
                <span>Copy Link</span>
              </>
            )}
          </button>
        </div>

        {/* QR Code Card */}
        <div className="bg-white rounded-xl border-2 border-slate-200 p-6 shadow-sm space-y-5">
          <div className="text-center">
            <h3 className="text-base font-semibold text-slate-900">QR Code</h3>
            <p className="text-sm text-slate-500 mt-0.5">Scan to open the event page</p>
          </div>

          <div className="flex justify-center items-center bg-slate-50 rounded-xl p-6 border border-slate-100">
            <div ref={qrCodeRef} />
          </div>

          <button
            onClick={handleDownloadQR}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm rounded-xl border border-slate-200 transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
          >
            <Download size={16} />
            Download QR Code
          </button>
        </div>
      </div>

      <CreateEventSlug
        open={showCreateSlug}
        eventId={eventId}
        spotixUserBase={SPOTIX_USER_BASE}
        onClose={() => setShowCreateSlug(false)}
        onCreated={(newSlug) => {
          setEventSlug(newSlug)
          setShowCreateSlug(false)
        }}
      />
    </div>
  )
}

export default EventLinkTab
