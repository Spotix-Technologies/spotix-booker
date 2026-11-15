/**
 * lib/event-time-status.ts
 *
 * Shared "has this happened yet" helper for anything with a calendar date
 * (events, polls) — pure function, safe to import from both server routes
 * (app/api/revenue/route.ts) and client components (events-section.tsx,
 * polls-section.tsx). No Firestore/React import here on purpose.
 *
 * Compares by CALENDAR DAY only (time-of-day is stripped from both sides)
 * against the caller's local clock:
 *   - target day is before today   -> "past"
 *   - target day is today          -> "today"
 *   - target day is after today    -> "upcoming"
 *
 * This is layered ON TOP of a record's own moderation/lifecycle flags
 * (active/inactive/flagged/suspended/cancelled) — it doesn't replace them.
 * See events-section.tsx / polls-section.tsx for how the two are combined
 * into the status pills shown on the dashboard.
 */

export type TimeStatus = "past" | "today" | "upcoming"

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

export function getTimeStatus(dateInput: string | number | Date | null | undefined): TimeStatus | null {
  if (!dateInput) return null
  const target = new Date(dateInput)
  if (isNaN(target.getTime())) return null

  const today = startOfDay(new Date())
  const targetDay = startOfDay(target)

  if (targetDay < today) return "past"
  if (targetDay > today) return "upcoming"
  return "today"
}

export const TIME_STATUS_LABEL: Record<TimeStatus, string> = {
  past: "Past",
  today: "Today",
  upcoming: "Upcoming",
}

export const TIME_STATUS_STYLE: Record<TimeStatus, string> = {
  upcoming: "bg-blue-50 text-blue-600 border-blue-200",
  today:    "bg-emerald-50 text-emerald-700 border-emerald-200",
  past:     "bg-slate-100 text-slate-500 border-slate-200",
}
