/**
 * app/lib/campaign-payment.ts
 *
 * Mirrors spotix-user/src/components/lib/vote-payment-utility.ts —
 * Popup V2 (`new PaystackPop()` + `.newTransaction()`), same metadata
 * custom_fields shape, adapted for "email_credit_purchase". Booker has
 * no existing inline-Paystack flow to reuse (its Paystack usage so far
 * is server-side bank-account resolution for payouts), so this is a
 * new-but-consistent addition rather than a duplicate of anything.
 */

function splitFullName(fullName?: string | null) {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean)
  const firstName = parts[0] ?? ""
  const lastName = parts[1] ?? firstName
  return { firstName, lastName }
}

export function isPaystackReady(): boolean {
  return typeof window !== "undefined" && !!(window as any).PaystackPop
}

export function ensurePaystackScriptLoaded(timeoutMs = 15000): Promise<boolean> {
  return new Promise((resolve) => {
    if (isPaystackReady()) return resolve(true)

    const existing = document.querySelector<HTMLScriptElement>('script[src="https://js.paystack.co/v2/inline.js"]')
    if (!existing) {
      const script = document.createElement("script")
      script.src = "https://js.paystack.co/v2/inline.js"
      script.async = true
      document.head.appendChild(script)
    }

    const start = Date.now()
    const poll = () => {
      if (isPaystackReady()) return resolve(true)
      if (Date.now() - start > timeoutMs) return resolve(false)
      setTimeout(poll, 100)
    }
    poll()
  })
}

export type CreditTransactionType = "email_credit_purchase" | "sms_credit_purchase"

interface PayForCreditsParams {
  paystackKey: string
  email: string
  fullName: string
  /** Naira, inclusive of the Paystack fee (VAT) — from the purchase init route's totalAmount. May carry kobo (₦456.75). */
  amount: number
  reference: string
  /** Defaults to "email_credit_purchase". The backend webhook routes on this. */
  transactionType?: CreditTransactionType
  /** Email credits belong to an event; SMS credits belong to the booker, so this is optional. */
  eventId?: string
  packageId?: string
  /** SMS credits are bought as a quantity rather than a package. */
  quantity?: number
  onSuccess: (reference: string) => void
  onClose: () => void
}

/**
 * Puts the payment reference in the page URL (?ref=…) the moment the buyer
 * clicks pay, WITHOUT navigating or re-rendering anything.
 *
 * Why: buyers often leave the browser to finish paying (bank app, USSD),
 * and when they come back the page has reloaded and all React state is gone —
 * they think the payment failed. With the reference in the URL, the reloaded
 * page can look the payment up and show a receipt (see
 * components/campaigns/purchase-receipt.tsx).
 */
export function appendRefToUrl(reference: string) {
  if (typeof window === "undefined") return
  const url = new URL(window.location.href)
  url.searchParams.set("ref", reference)
  window.history.replaceState(window.history.state, "", url.toString())
}

export function payForCampaignCredits(params: PayForCreditsParams) {
  const PS = (window as any).PaystackPop
  if (!PS) return null

  const { firstName, lastName } = splitFullName(params.fullName)
  const instance = new PS()

  return instance.newTransaction({
    key: params.paystackKey,
    email: params.email,
    amount: Math.round(params.amount * 100), // kobo
    currency: "NGN",
    ref: params.reference,
    first_name: firstName,
    last_name: lastName,
    metadata: {
      custom_fields: [
        { display_name: "Transaction Type", variable_name: "type", value: params.transactionType ?? "email_credit_purchase" },
        ...(params.eventId ? [{ display_name: "Event ID", variable_name: "event_id", value: params.eventId }] : []),
        ...(params.packageId ? [{ display_name: "Package ID", variable_name: "package_id", value: params.packageId }] : []),
        ...(params.quantity ? [{ display_name: "Credits", variable_name: "credit_quantity", value: String(params.quantity) }] : []),
      ],
    },
    onSuccess: (transaction: any) => params.onSuccess(transaction.reference),
    onCancel: () => params.onClose(),
  })
}

/** Removes ?ref=… again (receipt dismissed). */
export function clearRefFromUrl() {
  if (typeof window === "undefined") return
  const url = new URL(window.location.href)
  if (!url.searchParams.has("ref")) return
  url.searchParams.delete("ref")
  window.history.replaceState(window.history.state, "", url.toString())
}
