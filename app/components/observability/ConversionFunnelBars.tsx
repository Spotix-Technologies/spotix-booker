"use client"

// app/components/observability/ConversionFunnelBars.tsx
//
// The funnel itself, as a stack of proportionally-sized bars with the
// stage-to-stage conversion rate labeled in between — deliberately not
// framed as "X people abandoned", since Numerox only ever tells us a
// stage-to-stage difference, not a confirmed abandonment (see
// numerox's docs/security.md and types/stats.ts FunnelDropOff comment).

interface FunnelStage {
  label: string
  value: number
}

interface ConversionFunnelBarsProps {
  stages: FunnelStage[]
}

export default function ConversionFunnelBars({ stages }: ConversionFunnelBarsProps) {
  const max = Math.max(1, ...stages.map((s) => s.value))

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="text-sm font-semibold text-slate-800 mb-4">Conversion funnel</h3>
      <div className="space-y-3">
        {stages.map((stage, i) => {
          const widthPct = Math.max(2, (stage.value / max) * 100)
          const prev = stages[i - 1]
          const stepConversion = prev && prev.value > 0 ? stage.value / prev.value : null

          return (
            <div key={stage.label}>
              {i > 0 && (
                <p className="text-[11px] text-slate-400 mb-1 ml-1">
                  {stepConversion !== null ? `${(stepConversion * 100).toFixed(1)}% continued →` : "—"}
                </p>
              )}
              <div className="flex items-center gap-3">
                <div className="w-32 shrink-0 text-xs font-medium text-slate-600">{stage.label}</div>
                <div className="flex-1 h-8 bg-slate-50 rounded-md overflow-hidden">
                  <div
                    className="h-full rounded-md flex items-center justify-end px-2 transition-all"
                    style={{
                      width: `${widthPct}%`,
                      backgroundColor: "#6b2fa5",
                      opacity: 0.35 + (0.65 * (stages.length - i)) / stages.length,
                    }}
                  >
                    <span className="text-[11px] font-semibold text-white">{stage.value.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
