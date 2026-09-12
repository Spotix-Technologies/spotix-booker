"use client"

/**
 * TicketDateTimePicker
 *
 * Replaces the plain `<input type="date">` / `<input type="time">` pair
 * that create-event previously used (item 7 of the Sep 2026 UI
 * renovation). Two problems with the old inputs prompted this:
 *   1. Native date/time inputs render with the OS/browser's own chrome —
 *      completely inconsistent with the rest of the form, and on some
 *      browser/theme combinations the little calendar/clock glyph that's
 *      supposed to signal "click me" renders invisible (a white-on-white
 *      `::-webkit-calendar-picker-indicator`), so there was no visible
 *      affordance to open it at all.
 *   2. Reference UI (Jetron) shows the picker shaped like an actual event
 *      ticket — rounded body with a perforated notch — not a generic
 *      calendar dropdown.
 *
 * This is a single popover combining day-grid month navigation with an
 * hour/minute/AM-PM stepper, styled as a ticket stub. It's a controlled
 * component: `value` is a plain "YYYY-MM-DD" date string plus a separate
 * "HH:mm" 24h time string, mirroring the two state fields each call site
 * already had (eventDate/eventStart, stopDate, per-ticket sale windows),
 * so it drops in without changing any surrounding validation logic.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { Calendar, ChevronLeft, ChevronRight, Clock, Minus, Plus } from "lucide-react"

interface TicketDateTimePickerProps {
  label: string
  dateValue: string // "YYYY-MM-DD"
  timeValue?: string // "HH:mm" (24h) — unused/optional when dateOnly
  onChangeDate: (value: string) => void
  onChangeTime?: (value: string) => void // unused/optional when dateOnly
  minDate?: string
  maxDate?: string
  disabled?: boolean
  required?: boolean
  helperText?: string
  errorText?: string
  /** Hides the time-of-day half entirely — just the ticket-stub trigger
   *  and day-grid popover, no Clock button/stepper. Used wherever a filter
   *  or field only ever needs a calendar day (e.g. the attendees "bought
   *  on this day" filter), not a specific time. */
  dateOnly?: boolean
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]
const WEEKDAY_NAMES = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]

function pad2(n: number) {
  return String(n).padStart(2, "0")
}

function parseDate(value: string): Date | null {
  if (!value) return null
  const [y, m, d] = value.split("-").map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function displayDate(value: string): string {
  const d = parseDate(value)
  if (!d) return "Select date"
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })
}

function to12h(hhmm: string): { hour: number; minute: number; period: "AM" | "PM" } {
  if (!hhmm) return { hour: 12, minute: 0, period: "AM" }
  const [h, m] = hhmm.split(":").map(Number)
  const period: "AM" | "PM" = h >= 12 ? "PM" : "AM"
  let hour = h % 12
  if (hour === 0) hour = 12
  return { hour, minute: m || 0, period }
}

function from12h(hour: number, minute: number, period: "AM" | "PM"): string {
  let h = hour % 12
  if (period === "PM") h += 12
  return `${pad2(h)}:${pad2(minute)}`
}

function displayTime(hhmm: string): string {
  if (!hhmm) return "Select time"
  const { hour, minute, period } = to12h(hhmm)
  return `${hour}:${pad2(minute)} ${period}`
}

export function TicketDateTimePicker({
  label,
  dateValue,
  timeValue = "",
  onChangeDate,
  onChangeTime,
  minDate,
  maxDate,
  disabled,
  required,
  helperText,
  errorText,
  dateOnly = false,
}: TicketDateTimePickerProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const selected = parseDate(dateValue)
  const [viewMonth, setViewMonth] = useState(() => selected ?? new Date())

  useEffect(() => {
    if (selected) setViewMonth(selected)
  }, [dateValue]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [open])

  const minD = minDate ? parseDate(minDate) : null
  const maxD = maxDate ? parseDate(maxDate) : null

  const days = useMemo(() => {
    const year = viewMonth.getFullYear()
    const month = viewMonth.getMonth()
    const firstOfMonth = new Date(year, month, 1)
    const startOffset = firstOfMonth.getDay()
    const gridStart = new Date(year, month, 1 - startOffset)
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart)
      d.setDate(gridStart.getDate() + i)
      return d
    })
  }, [viewMonth])

  const { hour, minute, period } = to12h(timeValue)

  const isDisabledDay = (d: Date) => {
    if (minD && d < new Date(minD.getFullYear(), minD.getMonth(), minD.getDate())) return true
    if (maxD && d > new Date(maxD.getFullYear(), maxD.getMonth(), maxD.getDate())) return true
    return false
  }

  const adjustTime = (field: "hour" | "minute", delta: number) => {
    if (field === "hour") {
      let h = hour + delta
      if (h > 12) h = 1
      if (h < 1) h = 12
      onChangeTime(from12h(h, minute, period))
    } else {
      let m = minute + delta
      if (m > 59) m = 0
      if (m < 0) m = 59
      onChangeTime(from12h(hour, m, period))
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-sm font-semibold text-slate-700 mb-2">
        {label} {required && <span className="text-red-500">*</span>}
      </label>

      {/* Ticket-stub trigger button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="ticket-stub group relative w-full flex items-stretch overflow-hidden rounded-xl border-2 border-slate-200 bg-white text-left transition-all duration-200 hover:border-[#6b2fa5]/40 focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] focus:border-[#6b2fa5] disabled:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
      >
        <span className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3">
          <Calendar className="w-5 h-5 text-[#6b2fa5] flex-shrink-0" />
          <span className={`truncate text-sm font-semibold ${dateValue ? "text-slate-900" : "text-slate-400"}`}>
            {displayDate(dateValue)}
          </span>
        </span>
        {!dateOnly && (
          <>
            {/* perforated ticket divider */}
            <span className="ticket-notch relative flex-shrink-0 w-px my-2 border-l-2 border-dashed border-slate-200" />
            <span className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3">
              <Clock className="w-5 h-5 text-[#6b2fa5] flex-shrink-0" />
              <span className={`truncate text-sm font-semibold ${timeValue ? "text-slate-900" : "text-slate-400"}`}>
                {displayTime(timeValue)}
              </span>
            </span>
          </>
        )}
      </button>

      {helperText && !errorText && <p className="text-xs text-slate-500 mt-1">{helperText}</p>}
      {errorText && <p className="text-xs text-red-600 mt-1">{errorText}</p>}

      {open && !disabled && (
        <div className="ticket-popover absolute z-30 mt-2 w-[320px] sm:w-[360px] max-w-[90vw] rounded-2xl bg-slate-900 text-white shadow-2xl shadow-black/30 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="px-5 pt-4 pb-3 border-b border-dashed border-white/15">
            <p className="text-[11px] font-bold uppercase tracking-widest text-[#c9a6ec]">Event Date</p>
            <p className="text-sm text-slate-300 mt-0.5">Pick a date below</p>
          </div>

          {/* Month/year nav */}
          <div className="flex items-center justify-between px-5 pt-4">
            <button
              type="button"
              onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-bold">
              {MONTH_NAMES[viewMonth.getMonth()]} {viewMonth.getFullYear()}
            </span>
            <button
              type="button"
              onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Day grid */}
          <div className="px-5 pt-3">
            <div className="grid grid-cols-7 gap-1 text-center">
              {WEEKDAY_NAMES.map((w) => (
                <span key={w} className="text-[11px] font-semibold text-slate-400 py-1">
                  {w}
                </span>
              ))}
              {days.map((d, i) => {
                const inMonth = d.getMonth() === viewMonth.getMonth()
                const isSelected = selected && formatDate(d) === formatDate(selected)
                const blocked = isDisabledDay(d)
                return (
                  <button
                    type="button"
                    key={i}
                    disabled={blocked}
                    onClick={() => { onChangeDate(formatDate(d)); if (dateOnly) setOpen(false) }}
                    className={`aspect-square rounded-lg text-sm font-medium transition-colors
                      ${!inMonth ? "text-slate-600" : "text-slate-100"}
                      ${blocked ? "opacity-30 cursor-not-allowed" : "hover:bg-white/10"}
                      ${isSelected ? "bg-[#8b3fc5] text-white ring-2 ring-[#c9a6ec]" : ""}
                    `}
                  >
                    {d.getDate()}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Time stepper — flex-wrap so the AM/PM toggle drops to its own
              centered row instead of overflowing past the popover's edge
              and getting clipped by overflow-hidden above (it needs more
              width than hour+minute steppers alone leave on narrow
              screens). Skipped entirely in dateOnly mode. */}
          {!dateOnly && (
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 px-5 py-4 mt-2 border-t border-dashed border-white/15">
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => adjustTime("hour", -1)} className="w-7 h-7 rounded-md bg-white/5 hover:bg-white/10 flex items-center justify-center">
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="w-8 text-center text-sm font-bold tabular-nums">{pad2(hour)}</span>
                <button type="button" onClick={() => adjustTime("hour", 1)} className="w-7 h-7 rounded-md bg-white/5 hover:bg-white/10 flex items-center justify-center">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              <span className="text-lg font-bold text-slate-400">:</span>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => adjustTime("minute", -1)} className="w-7 h-7 rounded-md bg-white/5 hover:bg-white/10 flex items-center justify-center">
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="w-8 text-center text-sm font-bold tabular-nums">{pad2(minute)}</span>
                <button type="button" onClick={() => adjustTime("minute", 1)} className="w-7 h-7 rounded-md bg-white/5 hover:bg-white/10 flex items-center justify-center">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              {/* AM/PM toggle — this is the actual "choose AM or PM" control;
                  it was already wired up to onChangeTime, just visually
                  getting cut off (see note above). */}
              <div className="flex rounded-md overflow-hidden border border-white/15" role="group" aria-label="AM or PM">
                {(["AM", "PM"] as const).map((p) => (
                  <button
                    type="button"
                    key={p}
                    onClick={() => onChangeTime?.(from12h(hour, minute, p))}
                    aria-pressed={period === p}
                    className={`px-3 py-1.5 text-xs font-bold transition-colors ${
                      period === p ? "bg-[#8b3fc5] text-white" : "bg-white/5 text-slate-300 hover:bg-white/10"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Done */}
          <div className="px-5 pb-4 pt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-full py-2.5 rounded-lg bg-gradient-to-r from-[#6b2fa5] to-[#8b3fc5] text-white text-sm font-bold hover:opacity-90 transition-opacity"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
