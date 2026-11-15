"use client"

// app/components/observability/FunnelStatCard.tsx
//
// One metric card: a label, a big number, and an optional inline
// sparkline over the same date range — the Vercel-Observability-style
// "Edge Requests" card treatment, scaled down to one number per card.

import { AreaChart, Area, ResponsiveContainer } from "recharts"
import { useChartReady } from "@/hooks/useChartReady"

interface FunnelStatCardProps {
  label: string
  value: number
  /** Per-day values for the sparkline, oldest first. Omit to render the
   * card without a chart (e.g. while data is still loading). */
  sparkline?: number[]
  color?: string
  /** Optional small caption under the number, e.g. a conversion rate. */
  caption?: string
  /** Extra classes for the card's outer element — e.g. a grid col-span. */
  className?: string
}

const DEFAULT_COLOR = "#6b2fa5"

export default function FunnelStatCard({ label, value, sparkline, color = DEFAULT_COLOR, caption, className }: FunnelStatCardProps) {
  const ready = useChartReady()
  const chartData = (sparkline ?? []).map((v, i) => ({ i, v }))
  const gradientId = `funnel-stat-${label.replace(/\s+/g, "-").toLowerCase()}`

  return (
    <div className={`bg-white rounded-xl border border-slate-200 p-4 flex flex-col${className ? ` ${className}` : ""}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-2xl font-bold text-slate-900 mt-1">{value.toLocaleString()}</p>
      {caption && <p className="text-xs text-slate-500 mt-0.5">{caption}</p>}

      {chartData.length > 1 && (
        <div className="mt-3 h-12 -mx-1">
          {ready ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#${gradientId})`} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            // Same footprint as the real chart so nothing shifts once it
            // mounts — just no chart yet, and critically no recharts
            // measurement attempt before the card has been laid out.
            <div className="w-full h-full" />
          )}
        </div>
      )}
    </div>
  )
}
