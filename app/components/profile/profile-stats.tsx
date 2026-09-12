"use client"

import { Calendar, TrendingUp } from "lucide-react"
import { MaskedAmount, BalanceToggleButton } from "@/components/ui/masked-amount"
import { useBalanceVisibilityRoot, BalanceVisibilityCtx } from "@/hooks/use-balance-visibility"

interface ProfileData {
  eventsCreated: number
  totalRevenue: number
}

interface ProfileStatsProps {
  profileData: ProfileData
}

export function ProfileStats({ profileData }: ProfileStatsProps) {
  const balanceCtx = useBalanceVisibilityRoot()

  return (
    <BalanceVisibilityCtx.Provider value={balanceCtx}>
      <div className="space-y-2">

        {/* Mobile-only: Balance label + global toggle above the revenue card */}
        <div className="flex items-center justify-end gap-1.5 sm:hidden">
          <span className="text-xs text-slate-400 font-medium">Balance</span>
          <BalanceToggleButton />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-4">
          {/* Events Created */}
          <div className="@container bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-[#6b2fa5]/10 flex items-center justify-center flex-shrink-0">
              <Calendar className="w-5 h-5 text-[#6b2fa5]" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-400 font-medium mb-0.5">Events Created</p>
              {/* Fluid size (clamp via container query units) instead of a
                  fixed text-2xl, so a growing count shrinks to fit the card
                  rather than bleeding past its edge. */}
              <p
                className="font-bold text-[#6b2fa5] whitespace-nowrap text-[clamp(1.05rem,7cqw,1.5rem)]"
                title={String(profileData.eventsCreated)}
              >
                {profileData.eventsCreated}
              </p>
            </div>
          </div>

          {/* Total Revenue */}
          <div className="@container bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="min-w-0 flex-1">
              {/* On md+ screens show label + inline toggle together */}
              <div className="flex items-center gap-1 mb-0.5">
                <p className="text-xs text-slate-400 font-medium">Total Revenue</p>
                <span className="hidden sm:block">
                  <BalanceToggleButton className="!p-0.5" />
                </span>
              </div>
              <MaskedAmount
                value={`₦${profileData.totalRevenue.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`}
                size="lg"
                blockKey="revenue"
                className="text-slate-900"
                showToggle={false}
              />
            </div>
          </div>
        </div>
      </div>
    </BalanceVisibilityCtx.Provider>
  )
}
