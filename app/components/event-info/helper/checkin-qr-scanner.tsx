// app/components/event-info/helper/checkin-qr-scanner.tsx
//
// Camera-based QR reader for the Check-in tab. Wraps the `html5-qrcode`
// package — NOT currently in this project's package.json (no package.json
// shipped with this zip to add it to); run `npm install html5-qrcode`
// before this component will resolve. Loaded via dynamic import so it
// never touches the server bundle and the camera only ever initializes
// while this scan mode is actually active.
//
// Assumes the QR code on a ticket encodes the ticketId (the Firestore
// attendees/{ticketId} doc id — same value used for manual entry and the
// export's "ticketId" field). If tickets instead encode a URL or a JSON
// payload, decode/extract the ticketId from `decodedText` in onScan below
// before calling the parent's onScan.

"use client"

import { useEffect, useRef, useState } from "react"
import { Camera, Loader2 } from "lucide-react"

interface CheckinQrScannerProps {
  onScan: (value: string) => void
  active: boolean
}

export default function CheckinQrScanner({ onScan, active }: CheckinQrScannerProps) {
  const containerId = "checkin-qr-reader"
  // html5-qrcode's Html5Qrcode instance — typed loosely since the package
  // (and its types) aren't guaranteed to be installed in every checkout.
  const scannerRef = useRef<any>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!active) return
    let cancelled = false

    import("html5-qrcode")
      .then(({ Html5Qrcode }) => {
        if (cancelled) return
        const scanner = new Html5Qrcode(containerId)
        scannerRef.current = scanner
        return scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decodedText: string) => onScan(decodedText),
          () => { /* per-frame no-match — expected while framing the code, ignore */ }
        )
      })
      .then(() => { if (!cancelled) setReady(true) })
      .catch((e: any) => {
        if (!cancelled) setError(e?.message ?? "Could not start the camera — try manual entry instead.")
      })

    return () => {
      cancelled = true
      const scanner = scannerRef.current
      if (scanner) {
        scanner.stop?.().then(() => scanner.clear?.()).catch(() => { /* already stopped */ })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  if (!active) return null

  return (
    <div className="space-y-3">
      <div id={containerId} className="w-full max-w-sm mx-auto rounded-xl overflow-hidden border-2 border-slate-200" />
      {!ready && !error && (
        <p className="flex items-center justify-center gap-2 text-sm text-slate-400">
          <Loader2 size={14} className="animate-spin" /> Starting camera…
        </p>
      )}
      {error && (
        <p className="flex items-center justify-center gap-2 text-sm text-red-600">
          <Camera size={14} /> {error}
        </p>
      )}
    </div>
  )
}
