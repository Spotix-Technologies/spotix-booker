"use client"

/**
 * app/components/campaigns/buy-credits-modal.tsx
 *
 * spec §11–18. Every package is a single price and always includes
 * campaign statistics — analytics are no longer a separate paid tier.
 * Credits are bought for the booker's account and work across all their events.
 *
 * Built on ResponsiveSheet (bottom sheet on phones, right drawer on desktop);
 * #6b2fa5 brand purple for the primary action.
 *
 * Payment recovery: the moment the buyer clicks pay, the payment reference
 * is appended to the URL (?ref=…). If they leave the browser to finish
 * paying and the page reloads, the campaigns page sees the ref and shows
 * the receipt (see purchase-receipt.tsx) instead of leaving them guessing.
 */

import { useEffect, useState } from "react"
import { Loader2, Mail } from "lucide-react"
import { authFetch } from "@/lib/auth-client"
import { ensurePaystackScriptLoaded, payForCampaignCredits, appendRefToUrl } from "@/lib/campaign-payment"
import { formatNaira, formatCount } from "@/lib/naira"
import { ResponsiveSheet } from "@/components/ui/responsive-sheet"
import { PurchaseReceiptCard } from "@/components/campaigns/purchase-receipt"

interface Package {
  id: string
  credit_amount: number
  price: number
}

/**
 * Packages come from admin-edited Firestore docs. A doc missing `price` (or
 * `credit_amount`) used to crash this modal with "Cannot read properties of
 * undefined (reading 'toLocaleString')". Anything that isn't a sellable
 * package is dropped here, whatever the backend sent.
 */
function sanitizePackages(raw: unknown): Package[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((p: any) => ({ id: String(p?.id ?? ""), credit_amount: Number(p?.credit_amount), price: Number(p?.price) }))
    .filter((p) => p.id && Number.isFinite(p.credit_amount) && p.credit_amount > 0 && Number.isFinite(p.price) && p.price > 0)
}

export function BuyCreditsModal({ onClose, onPurchased }: {
  onClose: () => void
  onPurchased: () => void
}) {
  const [packages, setPackages] = useState<Package[] | null>(null)
  const [notConfigured, setNotConfigured] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [receiptRef, setReceiptRef] = useState<string | null>(null)

  useEffect(() => {
    ensurePaystackScriptLoaded()
    authFetch("/api/campaign-credit-packages")
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          const clean = sanitizePackages(data.packages)
          setPackages(clean)
          setNotConfigured(clean.length === 0)
        } else {
          setNotConfigured(true)
        }
      })
      .catch(() => setNotConfigured(true))
  }, [])

  const selected = packages?.find((p) => p.id === selectedId) || null
  const price = selected?.price ?? 0

  async function handlePay() {
    if (!selected) return
    setPaying(true)
    setError(null)
    try {
      const initRes = await authFetch("/api/campaign-credit-purchase", {
        method: "POST",
        body: JSON.stringify({ packageId: selected.id }),
      })
      const initData = await initRes.json()
      if (!initRes.ok || !initData.success) throw new Error(initData.error || "Failed to start purchase")

      const ready = await ensurePaystackScriptLoaded()
      if (!ready) throw new Error("Payment could not load — check your connection and try again")

      // Reference goes into the URL BEFORE the popup opens, so a buyer who
      // leaves the browser to pay and comes back to a reloaded page still
      // lands on their receipt.
      appendRefToUrl(initData.reference)

      payForCampaignCredits({
        paystackKey: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || "",
        email: initData.email,
        fullName: initData.name,
        amount: initData.totalAmount,
        reference: initData.reference,
        transactionType: "email_credit_purchase",
        packageId: selected.id,
        onSuccess: async (reference) => {
          try {
            // Immediate verify for instant feedback; the receipt below
            // re-checks (and polls) either way, and the webhook is the
            // backstop if this call never lands.
            await authFetch("/api/campaign-credit-purchase/verify", {
              method: "POST",
              body: JSON.stringify({ reference }),
            }).catch(() => {})
          } finally {
            setPaying(false)
            setReceiptRef(reference)
          }
        },
        onClose: () => setPaying(false),
      })
    } catch (e: any) {
      setError(e.message || "Something went wrong")
      setPaying(false)
    }
  }

  return (
    <ResponsiveSheet
      open
      onClose={onClose}
      size="md"
      dismissible={!paying}
      title={receiptRef ? "Payment receipt" : "Buy Email Credits"}
      bodyClassName="p-5"
    >
      <div className="space-y-4">
          {receiptRef ? (
            <PurchaseReceiptCard reference={receiptRef} onDone={onClose} onSuccessful={onPurchased} />
          ) : notConfigured ? (
            <div className="flex flex-col items-center text-center gap-3 py-8">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                <Mail className="w-6 h-6 text-slate-300" />
              </div>
              <p className="text-slate-500 text-sm">Email credits aren&apos;t configured yet. Check back later.</p>
            </div>
          ) : !packages ? (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 border-[#6b2fa5]/30 border-t-[#6b2fa5] rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {packages.map((pkg) => (
                  <button
                    key={pkg.id}
                    onClick={() => setSelectedId(pkg.id)}
                    className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${
                      selectedId === pkg.id
                        ? "border-[#6b2fa5] bg-[#6b2fa5]/5 ring-1 ring-[#6b2fa5]"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <p className="font-semibold text-slate-900">{formatCount(pkg.credit_amount)} credits</p>
                    <p className="text-xs text-slate-500 mt-0.5">{formatNaira(pkg.price)} · includes analytics</p>
                  </button>
                ))}
              </div>

              {selected && (
                <div className="flex justify-between text-sm border-t border-slate-100 pt-3">
                  <span className="text-slate-500">Package price (VAT added at checkout)</span>
                  <span className="font-semibold text-slate-900">{formatNaira(price)}+</span>
                </div>
              )}

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                disabled={!selected || paying}
                onClick={handlePay}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#6b2fa5] text-white px-4 py-3 text-sm font-semibold hover:bg-[#5a1f8a] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {paying && <Loader2 className="w-4 h-4 animate-spin" />} Pay with Paystack
              </button>
            </>
          )}
      </div>
    </ResponsiveSheet>
  )
}
