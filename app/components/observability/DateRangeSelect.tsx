"use client"

// app/components/observability/DateRangeSelect.tsx
//
// A days-back selector, bounded by whatever maxDaysFetch ceiling the
// API reported for the current context (an event's own default/admin
// override, or the fixed 5-day all-events aggregate). Never renders an
// option that would make the API reject the request.

interface DateRangeSelectProps {
  days: number
  maxDaysFetch: number
  onChange: (days: number) => void
}

const ALL_OPTIONS = [1, 3, 5, 7, 14, 30, 60, 90, 180, 365]

export default function DateRangeSelect({ days, maxDaysFetch, onChange }: DateRangeSelectProps) {
  const options = ALL_OPTIONS.filter((d) => d <= maxDaysFetch)
  if (!options.includes(maxDaysFetch)) options.push(maxDaysFetch)

  return (
    <select
      value={days}
      onChange={(e) => onChange(Number(e.target.value))}
      className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-[#6b2fa5]/30"
    >
      {options.map((d) => (
        <option key={d} value={d}>
          Last {d} {d === 1 ? "day" : "days"}
        </option>
      ))}
    </select>
  )
}
