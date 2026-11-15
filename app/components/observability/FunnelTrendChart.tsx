"use client"

// app/components/observability/FunnelTrendChart.tsx
//
// The big "Edge Requests"-style card: page views / checkout starts /
// successful payments over the selected date range, as three overlaid
// lines so the funnel's shape over time is visible at a glance.

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"
import { useChartReady } from "@/hooks/useChartReady"

export interface FunnelTrendDay {
  date: string
  pageViews: number
  checkoutStarts: number
  paymentSuccess: number
}

interface FunnelTrendChartProps {
  daily: FunnelTrendDay[]
}

function formatDateLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
}

export default function FunnelTrendChart({ daily }: FunnelTrendChartProps) {
  const ready = useChartReady()
  const data = daily.map((d) => ({ ...d, label: formatDateLabel(d.date) }))

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="text-sm font-semibold text-slate-800 mb-4">Funnel over time</h3>
      {data.length === 0 ? (
        <p className="text-center text-slate-400 text-sm py-16">No activity in this date range yet.</p>
      ) : !ready ? (
        // Same footprint as the real chart — avoids both a layout shift
        // once it mounts and a recharts measurement attempt before this
        // card has actually been laid out (see useChartReady.ts).
        <div className="h-[260px]" />
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} tickLine={false} />
            <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{ backgroundColor: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "12px" }}
              labelStyle={{ fontWeight: 600, color: "#1e293b" }}
            />
            <Legend wrapperStyle={{ fontSize: "12px" }} />
            <Line type="monotone" dataKey="pageViews" name="Page Views" stroke="#94a3b8" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="checkoutStarts" name="Checkout Starts" stroke="#c084fc" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="paymentSuccess" name="Successful Payments" stroke="#6b2fa5" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
