"use client"

import React, { useState, useEffect, useRef } from "react"
import { Copy, Check, Link2, Download, ExternalLink } from "lucide-react"
import QRCodeStyling from "qr-code-styling"

interface EventLinkTabProps {
  eventId: string
}

const EventLinkTab: React.FC<EventLinkTabProps> = ({ eventId }) => {
  const [copied, setCopied] = useState(false)
  const qrCodeRef = useRef<HTMLDivElement>(null)
  const qrCodeInstance = useRef<any>(null)

  const eventUrl = `${process.env.NEXT_PUBLIC_APP_URL}/event/${eventId}`

  useEffect(() => {
    if (!qrCodeRef.current || qrCodeInstance.current) return

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
      name: `spotix-event-${eventId}-qr`,
      extension: "png",
    })
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Event Link & QR Code</h2>
        <p className="text-slate-500 mt-1 text-sm">Share your event link or let attendees scan the QR code</p>
      </div>

      {/* Shortlink Card */}
      <div className="bg-white rounded-xl border-2 border-slate-200 p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#6b2fa5]/10 rounded-lg">
            <Link2 size={20} className="text-[#6b2fa5]" />
          </div>
          <h3 className="text-base font-semibold text-slate-900">Event Link</h3>
        </div>

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
  )
}

export default EventLinkTab