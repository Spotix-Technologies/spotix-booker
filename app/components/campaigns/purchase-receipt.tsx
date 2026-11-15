"use client"

/**
 * app/components/campaigns/purchase-receipt.tsx
 *
 * The receipt for a credit purchase (email OR SMS), looked up by payment
 * reference alone. Used in two places:
 *   1. right after the Paystack popup reports success (inside the buy modals)
 *   2. when the page loads with `?ref=…` in the URL — i.e. the buyer left the
 *      browser to finish paying and came back to a reloaded page.
 *
 * Shows one of: successful (with the number of credits), still pending, or
 * failed. Pending is polled for a minute (the payment may be completing in
 * their bank app right now) and can be re-checked by hand after that.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { CheckCircle2, Clock, XCircle, Loader2 } from "lucide-react"
import { authFetch } from "@/lib/auth-client"
import { ResponsiveSheet } from "@/components/ui/responsive-sheet"
import { formatNaira, formatCount } from "@/lib/naira"

export interface PurchaseStatus {
  kind: "email" | "sms"
  status: "successful" | "pending" | "failed"
  reference: string
  creditAmount: number
  price: number
  discountAmount: number
  discountPercent: number
  vat: number
  totalAmount: number
  eventId: string | null
  createdAt: string
  paymentCompletedAt: string | null
}

const POLL_MS = 5000
const MAX_POLLS = 12

function SupportLine() {
  return (
    <p className="text-sm text-slate-500">
      If you&apos;ve paid, click{" "}
      <a href="#" className="font-semibold text-[#6b2fa5] hover:text-[#5a1f8a] underline underline-offset-2">here</a>{" "}
      to contact support.
    </p>
  )
}

export function PurchaseReceiptCard({ reference, onDone, onSuccessful }: {
  reference: string
  onDone: () => void
  onSuccessful?: () => void
}) {
  const [purchase, setPurchase] = useState<PurchaseStatus | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(true)
  const [pollsLeft, setPollsLeft] = useState(MAX_POLLS)
  const notifiedRef = useRef(false)

  const check = useCallback(async () => {
    try {
      const res = await authFetch(`/api/campaign-credit-purchase/status?reference=${encodeURIComponent(reference)}`)
      const data = await res.json().catch(() => ({}))
      if (res.status === 404) {
        setNotFound(true)
        setPurchase(null)
      } else if (data.success && data.purchase) {
        setNotFound(false)
        setPurchase(data.purchase)
      }
    } catch {
      // Network blip — keep whatever we last showed; polling will retry.
    } finally {
      setLoading(false)
    }
  }, [reference])

  useEffect(() => { check() }, [check])

  // Poll while pending.
  useEffect(() => {
    if (purchase?.status !== "pending" || pollsLeft <= 0) return
    const t = setTimeout(() => {
      setPollsLeft((n) => n - 1)
      check()
    }, POLL_MS)
    return () => clearTimeout(t)
  }, [purchase, pollsLeft, check])

  useEffect(() => {
    if (purchase?.status === "successful" && !notifiedRef.current) {
      notifiedRef.current = true
      onSuccessful?.()
    }
  }, [purchase, onSuccessful])

  if (loading) {
    return (
      <div className="flex flex-col items-center text-center gap-3 py-10">
        <Loader2 className="w-8 h-8 animate-spin text-[#6b2fa5]" />
        <p className="text-sm text-slate-500">Checking your payment…</p>
      </div>
    )
  }

  if (notFound || !purchase) {
    return (
      <div className="flex flex-col items-center text-center gap-3 py-6">
        <XCircle className="w-10 h-10 text-red-500" />
        <p className="font-semibold text-slate-900">We couldn&apos;t find that payment</p>
        <p className="text-xs text-slate-400 break-all">Ref: {reference}</p>
        <SupportLine />
        <button onClick={onDone} className="rounded-xl bg-[#6b2fa5] text-white px-5 py-2.5 text-sm font-semibold hover:bg-[#5a1f8a] transition-colors">Close</button>
      </div>
    )
  }

  const label = purchase.kind === "sms" ? "SMS" : "email"

  if (purchase.status === "successful") {
    return (
      <div className="flex flex-col items-center text-center gap-4 py-2">
        <CheckCircle2 className="w-12 h-12 text-green-600" />
        <div>
          <p className="font-semibold text-slate-900 text-lg">Payment successful</p>
          <p className="text-sm text-slate-600 mt-1">
            <span className="font-semibold text-slate-900">{formatCount(purchase.creditAmount)} {label} credits</span>{" "}
            {purchase.kind === "email" ? "were added to your event." : "were added to your account."}
          </p>
        </div>

        <div className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm space-y-1.5 text-left">
          <div className="flex justify-between"><span className="text-slate-500">Credit price</span><span className="text-slate-800">{formatNaira(purchase.price)}</span></div>
          {purchase.discountAmount > 0 && (
            <div className="flex justify-between"><span className="text-slate-500">Discount{purchase.discountPercent ? ` (${purchase.discountPercent}%)` : ""}</span><span className="text-green-700">-{formatNaira(purchase.discountAmount)}</span></div>
          )}
          <div className="flex justify-between"><span className="text-slate-500">VAT</span><span className="text-slate-800">{formatNaira(purchase.vat)}</span></div>
          <div className="flex justify-between border-t border-slate-200 pt-1.5 font-semibold"><span className="text-slate-700">Total paid</span><span className="text-slate-900">{formatNaira(purchase.totalAmount)}</span></div>
          <p className="text-[11px] text-slate-400 break-all pt-1">Ref: {purchase.reference}</p>
        </div>

        <p className="text-xs text-slate-400">A confirmation email is sharply on its way to you.</p>
        <button onClick={onDone} className="rounded-xl bg-[#6b2fa5] text-white px-5 py-2.5 text-sm font-semibold hover:bg-[#5a1f8a] transition-colors">Done</button>
      </div>
    )
  }

  const isPending = purchase.status === "pending"
  return (
    <div className="flex flex-col items-center text-center gap-3 py-4">
      {isPending ? <Clock className="w-12 h-12 text-amber-500" /> : <XCircle className="w-12 h-12 text-red-500" />}
      <div>
        <p className="font-semibold text-slate-900 text-lg">{isPending ? "Payment still processing" : "Payment failed"}</p>
        <p className="text-sm text-slate-600 mt-1">
          {isPending
            ? `We haven't received confirmation of this payment yet. ${pollsLeft > 0 ? "We're still checking…" : ""}`
            : "This payment didn't go through, so no credits were added."}
        </p>
      </div>
      <p className="text-xs text-slate-400 break-all">Ref: {purchase.reference}</p>
      <SupportLine />
      <div className="flex flex-wrap justify-center gap-2 pt-1">
        {isPending && (
          <button
            onClick={() => { setLoading(true); setPollsLeft(MAX_POLLS); check() }}
            className="rounded-xl border border-slate-200 bg-white text-slate-600 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 transition-colors"
          >
            Check again
          </button>
        )}
        <button onClick={onDone} className="rounded-xl bg-[#6b2fa5] text-white px-5 py-2.5 text-sm font-semibold hover:bg-[#5a1f8a] transition-colors">Close</button>
      </div>
    </div>
  )
}

/** The receipt in its own modal — what `?ref=…` on page load opens. */
export function PurchaseReceiptModal({ reference, onClose, onSuccessful }: {
  reference: string
  onClose: () => void
  onSuccessful?: () => void
}) {
  return (
    <ResponsiveSheet open onClose={onClose} size="md" title="Payment receipt" bodyClassName="p-5">
      <PurchaseReceiptCard reference={reference} onDone={onClose} onSuccessful={onSuccessful} />
    </ResponsiveSheet>
  )
}
