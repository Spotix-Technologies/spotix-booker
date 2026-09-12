"use client"

/**
 * app/components/event-info/helper/receipt-modal.tsx
 *
 * Preview + download for a single payout receipt image — see
 * app/lib/receipt-image.ts for how the PNG itself is drawn. Shared by
 * payouts-tab.tsx's TxnCard (Transaction Days) and payout-log.tsx
 * (Payout Logs) so "View Receipt" looks and behaves identically from
 * either view.
 *
 * Builds the canvas once on open and reuses it for both the on-screen
 * preview (canvas.toDataURL) and the download (canvas.toBlob) — no
 * redundant redraw between the two.
 */

import { useEffect, useRef, useState } from "react"
import { X, Download, Loader2, AlertCircle } from "lucide-react"
import { buildReceiptCanvas, type ReceiptData } from "@/lib/receipt-image"

interface ReceiptModalProps {
  data: ReceiptData
  onClose: () => void
}

export default function ReceiptModal({ data, onClose }: ReceiptModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    buildReceiptCanvas(data)
      .then((canvas) => {
        if (cancelled) return
        canvasRef.current = canvas
        setPreviewUrl(canvas.toDataURL("image/png"))
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't generate the receipt. Try again.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // data.reference is a stable enough identity for this modal's lifetime —
    // it's opened fresh (remounted) per record, never reused across records.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.reference])

  function handleDownload() {
    const canvas = canvasRef.current
    if (!canvas) return
    setDownloading(true)
    canvas.toBlob((blob) => {
      setDownloading(false)
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `spotix-receipt-${data.reference || "payout"}.png`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    }, "image/png")
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-900">Payout Receipt</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={22} className="animate-spin text-[#6b2fa5]" />
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 text-sm text-red-600 py-8 justify-center">
              <AlertCircle size={16} className="flex-shrink-0" />
              {error}
            </div>
          ) : (
            <img
              src={previewUrl ?? undefined}
              alt={`Payout receipt for ${data.reference}`}
              className="w-full rounded-xl border border-gray-200"
            />
          )}

          <button
            onClick={handleDownload}
            disabled={loading || !!error || downloading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#6b2fa5] text-white hover:bg-[#5a2589] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {downloading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            Download as Image
          </button>
        </div>
      </div>
    </div>
  )
}
