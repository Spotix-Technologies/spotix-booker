"use client"

/**
 * BurdenOfFeeCard
 *
 * Item 6 of the Sep 2026 UI renovation. Writes to the event's `feeBurden`
 * field — spotix-user's checkout math (utils/priceUtility.ts,
 * computeOrderPricing/resolveFeeBurden) already fully consumes this shape,
 * it just had nowhere to be set from until now. Two independent toggles
 * rather than one combined switch, since an organizer might reasonably
 * want to cover Paystack's processing fee themselves while still passing
 * Spotix's platform fee on to attendees, or vice versa.
 */

import { CreditCard, Percent } from "lucide-react"

export interface FeeBurdenState {
  coversPaystackFee: boolean
  coversSpotixFee: boolean
}

interface BurdenOfFeeCardProps {
  feeBurden: FeeBurdenState
  setFeeBurden: (value: FeeBurdenState) => void
}

function ToggleRow({
  icon: Icon,
  title,
  description,
  checked,
  onChange,
}: {
  icon: typeof CreditCard
  title: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 p-4 rounded-lg border-2 border-slate-200 hover:border-[#6b2fa5]/30 transition-colors">
      <div className="flex items-start gap-3 min-w-0">
        <div className="flex items-center justify-center w-9 h-9 bg-[#6b2fa5]/10 rounded-lg flex-shrink-0">
          <Icon className="w-4.5 h-4.5 text-[#6b2fa5]" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="text-xs text-slate-600 mt-0.5">{description}</p>
        </div>
      </div>
      <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only peer" />
        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#6b2fa5]/20 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#6b2fa5]"></div>
      </label>
    </div>
  )
}

export function BurdenOfFeeCard({ feeBurden, setFeeBurden }: BurdenOfFeeCardProps) {
  return (
    <div className="rounded-xl border-2 border-slate-200 bg-white p-6 space-y-4 shadow-sm">
      <div>
        <h4 className="font-bold text-lg text-slate-900">Who pays the fees?</h4>
        <p className="text-sm text-slate-600 mt-0.5">
          Choose whether you or your attendees cover each fee. Both are off by default, meaning
          attendees pay them. You can change this later in the event's settings.
        </p>
      </div>

      <ToggleRow
        icon={CreditCard}
        title="I'll cover the payment provider's fee"
        description="Payment provider's processing fee is absorbed by you instead of added to the attendee's total."
        checked={feeBurden.coversPaystackFee}
        onChange={(checked) => setFeeBurden({ ...feeBurden, coversPaystackFee: checked })}
      />

      <ToggleRow
        icon={Percent}
        title="I'll cover Spotix's platform fee"
        description="Spotix's platform fee is absorbed by you instead of added to the attendee's total."
        checked={feeBurden.coversSpotixFee}
        onChange={(checked) => setFeeBurden({ ...feeBurden, coversSpotixFee: checked })}
      />
    </div>
  )
}
