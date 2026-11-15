"use client"

/**
 * app/components/campaigns/buy-sms-credits-modal.tsx
 *
 * SMS credits are billed per number sent. The booker types how many credits
 * they want; the server prices it from the admin's volume thresholds (and MOQ),
 * applies an optional percentage discount code to the CREDIT price only, then
 * adds VAT (Paystack's fee, never discounted) on top.
 *
 * Every figure shown comes from /api/sms/quote — nothing is calculated in the
 * browser, and the real charge is recomputed again server-side at purchase.
 *
 * As with the email modal, the payment reference is appended to the URL the
 * moment the buyer clicks pay (?ref=…), so a reload after paying in another
 * app lands on the receipt.
 */

import { useEffect, useRef, useState } from "react"
import { Loader2, MessageSquareText, Tag } from "lucide-react"
import { authFetch } from "@/lib/auth-client"
import { ensurePaystackScriptLoaded, payForCampaignCredits, appendRefToUrl } from "@/lib/campaign-payment"
import { formatNaira, formatCount } from "@/lib/naira"
import { ResponsiveSheet } from "@/components/ui/responsive-sheet"
import { PurchaseReceiptCard } from "@/components/campaigns/purchase-receipt"

interface Tier { minQty: number; price: number }
interface Pricing { configured: boolean; basePrice: number; moq: number; tiers: Tier[] }
interface Quote {
  quantity: number
  unitPrice: number
  subtotal: number
  discountCode: string | null
  discountPercent: number
  discountAmount: number
  discountedSubtotal: number
  vat: number
  total: number
}

export function BuySmsCreditsModal({ onClose, onPurchased }: {
  onClose: () => void
  onPurchased: () => void
}) {
  const [pricing, setPricing] = useState<Pricing | null>(null)
  const [pricingError, setPricingError] = useState(false)
  const [qtyInput, setQtyInput] = useState("")
  const [codeInput, setCodeInput] = useState("")
  const [appliedCode, setAppliedCode] = useState<string | null>(null)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [codeError, setCodeError] = useState<string | null>(null)
  const [quoting, setQuoting] = useState(false)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [receiptRef, setReceiptRef] = useState<string | null>(null)
  const quoteSeq = useRef(0)

  useEffect(() => {
    ensurePaystackScriptLoaded()
    authFetch("/api/sms/pricing")
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.configured) {
          setPricing({ configured: true, basePrice: Number(data.basePrice), moq: Number(data.moq) || 1, tiers: data.tiers || [] })
        } else {
          setPricingError(true)
        }
      })
      .catch(() => setPricingError(true))
  }, [])

  const quantity = Number(qtyInput)
  const validQty = Number.isInteger(quantity) && quantity >= 1

  // Re-quote (debounced) whenever the quantity or applied code changes.
  useEffect(() => {
    if (!pricing) return
    setQuote(null)
    setQuoteError(null)
    if (!qtyInput) return
    if (!validQty) { setQuoteError("Enter a whole number of credits"); return }
    if (quantity < pricing.moq) { setQuoteError(`The minimum order is ${formatCount(pricing.moq)} credits`); return }

    const seq = ++quoteSeq.current
    setQuoting(true)
    const t = setTimeout(async () => {
      try {
        const res = await authFetch("/api/sms/quote", {
          method: "POST",
          body: JSON.stringify({ quantity, discountCode: appliedCode || undefined }),
        })
        const data = await res.json().catch(() => ({}))
        if (seq !== quoteSeq.current) return // a newer request superseded this one
        if (data.success) {
          setQuote(data.quote)
        } else if (data.error === "invalid_discount") {
          // Code went bad (expired/deactivated) after being applied — drop it.
          setAppliedCode(null)
          setCodeError(data.message || "That code isn't valid")
        } else {
          setQuoteError(data.message || data.error || "Couldn't calculate the price")
        }
      } catch {
        if (seq === quoteSeq.current) setQuoteError("Couldn't calculate the price — check your connection")
      } finally {
        if (seq === quoteSeq.current) setQuoting(false)
      }
    }, 350)
    return () => clearTimeout(t)
  }, [pricing, qtyInput, appliedCode]) // eslint-disable-line react-hooks/exhaustive-deps

  async function applyCode() {
    const code = codeInput.trim().toUpperCase()
    if (!code) return
    if (!validQty || (pricing && quantity < pricing.moq)) {
      setCodeError("Enter a valid number of credits first")
      return
    }
    setCodeError(null)
    try {
      const res = await authFetch("/api/sms/quote", { method: "POST", body: JSON.stringify({ quantity, discountCode: code }) })
      const data = await res.json().catch(() => ({}))
      if (data.success) { setAppliedCode(code); setCodeInput("") }
      else setCodeError(data.message || "That code isn't valid")
    } catch {
      setCodeError("Couldn't check that code — try again")
    }
  }

  async function handlePay() {
    if (!quote) return
    setPaying(true)
    setError(null)
    try {
      const initRes = await authFetch("/api/sms/credit-purchase", {
        method: "POST",
        body: JSON.stringify({ quantity: quote.quantity, discountCode: appliedCode || undefined }),
      })
      const initData = await initRes.json()
      if (!initRes.ok || !initData.success) throw new Error(initData.message || initData.error || "Failed to start purchase")

      const ready = await ensurePaystackScriptLoaded()
      if (!ready) throw new Error("Payment could not load — check your connection and try again")

      appendRefToUrl(initData.reference)

      payForCampaignCredits({
        paystackKey: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || "",
        email: initData.email,
        fullName: initData.name,
        amount: initData.totalAmount,
        reference: initData.reference,
        transactionType: "sms_credit_purchase",
        quantity: quote.quantity,
        onSuccess: async (reference) => {
          try {
            await authFetch("/api/sms/credit-purchase/verify", {
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

  const inputClass = "w-full border border-slate-200 rounded-lg px-3 py-2.5 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#6b2fa5]/30 focus:border-[#6b2fa5]"

  return (
    <ResponsiveSheet
      open
      onClose={onClose}
      size="md"
      dismissible={!paying}
      title={receiptRef ? "Payment receipt" : "Buy SMS Credits"}
      bodyClassName="p-5"
    >
      <div className="space-y-4">
          {receiptRef ? (
            <PurchaseReceiptCard reference={receiptRef} onDone={onClose} onSuccessful={onPurchased} />
          ) : pricingError ? (
            <div className="flex flex-col items-center text-center gap-3 py-8">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                <MessageSquareText className="w-6 h-6 text-slate-300" />
              </div>
              <p className="text-slate-500 text-sm">Bulk SMS credits aren&apos;t available yet. Check back later.</p>
            </div>
          ) : !pricing ? (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 border-[#6b2fa5]/30 border-t-[#6b2fa5] rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <div>
                <label className="text-sm font-medium text-slate-700">How many SMS credits?</label>
                <input
                  type="number" inputMode="numeric" min={pricing.moq} step={1}
                  value={qtyInput} onChange={(e) => setQtyInput(e.target.value)}
                  placeholder={`Minimum ${formatCount(pricing.moq)}`}
                  className={`${inputClass} mt-1`}
                />
                <p className="text-xs text-slate-400 mt-1">1 credit = 1 number sent. Minimum order {formatCount(pricing.moq)}.</p>
              </div>

              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <p className="px-3 py-2 text-xs font-semibold text-slate-500 bg-slate-50 border-b border-slate-200">Price per SMS</p>
                <div className="divide-y divide-slate-100 text-sm">
                  <div className={`flex justify-between px-3 py-1.5 ${quote && quote.unitPrice === pricing.basePrice ? "bg-[#6b2fa5]/5 font-semibold" : ""}`}>
                    <span className="text-slate-600">{formatCount(pricing.moq)}{pricing.tiers.length ? ` – ${formatCount(pricing.tiers[0].minQty - 1)}` : "+"}</span>
                    <span className="text-slate-900">{formatNaira(pricing.basePrice)}</span>
                  </div>
                  {pricing.tiers.map((t, i) => {
                    const next = pricing.tiers[i + 1]
                    const active = quote && quote.unitPrice === t.price && quantity >= t.minQty && (!next || quantity < next.minQty)
                    return (
                      <div key={t.minQty} className={`flex justify-between px-3 py-1.5 ${active ? "bg-[#6b2fa5]/5 font-semibold" : ""}`}>
                        <span className="text-slate-600">{formatCount(t.minQty)}{next ? ` – ${formatCount(next.minQty - 1)}` : "+"}</span>
                        <span className="text-slate-900">{formatNaira(t.price)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div>
                {appliedCode ? (
                  <div className="flex items-center justify-between rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm">
                    <span className="inline-flex items-center gap-1.5 text-green-800 font-medium"><Tag className="w-3.5 h-3.5" /> {appliedCode} applied</span>
                    <button onClick={() => { setAppliedCode(null); setCodeError(null) }} className="text-xs text-green-700 underline">Remove</button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      value={codeInput} onChange={(e) => { setCodeInput(e.target.value); setCodeError(null) }}
                      onKeyDown={(e) => { if (e.key === "Enter") applyCode() }}
                      placeholder="Discount code" className={`${inputClass} uppercase`}
                    />
                    <button onClick={applyCode} disabled={!codeInput.trim()} className="rounded-xl border border-slate-200 bg-white text-slate-700 px-4 text-sm font-semibold hover:bg-slate-50 transition-colors disabled:opacity-40">Apply</button>
                  </div>
                )}
                {codeError && <p className="text-xs text-red-600 mt-1">{codeError}</p>}
              </div>

              {quoteError && <p className="text-sm text-red-600">{quoteError}</p>}

              {(quote || quoting) && !quoteError && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm space-y-1.5 relative">
                  {quoting && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400 absolute right-3 top-3" />}
                  {quote && (
                    <>
                      <div className="flex justify-between"><span className="text-slate-500">{formatCount(quote.quantity)} × {formatNaira(quote.unitPrice)}</span><span className="text-slate-800">{formatNaira(quote.subtotal)}</span></div>
                      {quote.discountAmount > 0 && (
                        <div className="flex justify-between"><span className="text-slate-500">Discount ({quote.discountPercent}%)</span><span className="text-green-700">-{formatNaira(quote.discountAmount)}</span></div>
                      )}
                      <div className="flex justify-between"><span className="text-slate-500">VAT</span><span className="text-slate-800">{formatNaira(quote.vat)}</span></div>
                      <div className="flex justify-between border-t border-slate-200 pt-1.5 font-semibold"><span className="text-slate-700">Total to pay</span><span className="text-slate-900">{formatNaira(quote.total)}</span></div>
                    </>
                  )}
                </div>
              )}

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                disabled={!quote || quoting || paying}
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
