"use client"

import { useState, useEffect } from "react"
import { X, Filter, Check } from "lucide-react"
import { TicketDateTimePicker } from "@/components/create-event/helper/TicketDateTimePicker"

export interface AttendeeFilters {
  checkInFilter: "all" | "checkedIn" | "notCheckedIn"
  ticketTypeFilter: string[]
  /** "YYYY-MM-DD", or "" for no bound. Purchases on or after this date. */
  startDate: string
  /** "YYYY-MM-DD", or "" for no bound. Purchases on or before this date. */
  endDate: string
}

export const EMPTY_ATTENDEE_FILTERS: AttendeeFilters = {
  checkInFilter: "all",
  ticketTypeFilter: [],
  startDate: "",
  endDate: "",
}

interface AttendeeFilterDialogProps {
  open: boolean
  onClose: () => void
  /** Fires only when the admin clicks "Apply Filter" — draft selections
   *  made inside the dialog before that are never sent to the parent. */
  onApply: (filters: AttendeeFilters) => void
  ticketTypes: string[]
  /** Whatever's currently actually applied — the dialog re-syncs its draft
   *  from this every time it opens, so re-opening after closing without
   *  applying shows the real active filters, not abandoned edits. */
  appliedFilters: AttendeeFilters
}

export default function AttendeeFilterDialog({
  open,
  onClose,
  onApply,
  ticketTypes,
  appliedFilters,
}: AttendeeFilterDialogProps) {
  // Draft state — only committed on "Apply Filter".
  const [checkInFilter, setCheckInFilter] = useState(appliedFilters.checkInFilter)
  const [ticketTypeFilter, setTicketTypeFilter] = useState<string[]>(appliedFilters.ticketTypeFilter)
  const [startDate, setStartDate] = useState(appliedFilters.startDate)
  const [endDate, setEndDate] = useState(appliedFilters.endDate)

  useEffect(() => {
    if (!open) return
    setCheckInFilter(appliedFilters.checkInFilter)
    setTicketTypeFilter(appliedFilters.ticketTypeFilter)
    setStartDate(appliedFilters.startDate)
    setEndDate(appliedFilters.endDate)
    // Only re-sync when the dialog transitions to open — not on every
    // appliedFilters change, which would otherwise clobber the draft the
    // admin's mid-edit on if the parent happens to re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  const toggleTicketType = (type: string) => {
    setTicketTypeFilter((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    )
  }

  const handleApply = () => {
    // Swap into order rather than silently returning zero rows if the
    // admin picked an end date earlier than the start date.
    let s = startDate
    let e = endDate
    if (s && e && s > e) { const tmp = s; s = e; e = tmp }

    onApply({ checkInFilter, ticketTypeFilter, startDate: s, endDate: e })
    onClose()
  }

  const handleClearAll = () => {
    setCheckInFilter("all")
    setTicketTypeFilter([])
    setStartDate("")
    setEndDate("")
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#6b2fa5]/10 rounded-xl flex-shrink-0">
              <Filter size={20} className="text-[#6b2fa5]" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Filter Attendees</h3>
              <p className="text-sm text-slate-500 mt-0.5">Combine any of these — none are required</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-xl transition-all duration-200 hover:scale-110 active:scale-95 flex-shrink-0"
          >
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        <div className="px-6 py-6 space-y-6">
          {/* Check-in status */}
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-3">Check-in status</p>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { value: "all", label: "All" },
                  { value: "checkedIn", label: "Checked In" },
                  { value: "notCheckedIn", label: "Not Checked In" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setCheckInFilter(opt.value)}
                  className={`px-3 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all duration-200 ${
                    checkInFilter === opt.value
                      ? "border-[#6b2fa5] bg-[#6b2fa5] text-white"
                      : "border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Ticket types */}
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-3">Ticket types</p>
            {ticketTypes.length === 0 ? (
              <p className="text-sm text-slate-400">No ticket types configured on this event</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {ticketTypes.map((type) => {
                  const checked = ticketTypeFilter.includes(type)
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => toggleTicketType(type)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border-2 transition-all duration-200 ${
                        checked
                          ? "border-[#6b2fa5] bg-[#6b2fa5]/10 text-[#6b2fa5]"
                          : "border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      <span
                        className={`w-4 h-4 rounded flex items-center justify-center border-2 flex-shrink-0 ${
                          checked ? "bg-[#6b2fa5] border-[#6b2fa5]" : "border-slate-300"
                        }`}
                      >
                        {checked && <Check size={11} className="text-white" />}
                      </span>
                      {type}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Purchase date range */}
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-3">Purchase date range</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TicketDateTimePicker
                label="Select transaction start date"
                dateOnly
                dateValue={startDate}
                onChangeDate={setStartDate}
                maxDate={endDate || undefined}
              />
              <TicketDateTimePicker
                label="Select transaction end date"
                dateOnly
                dateValue={endDate}
                onChangeDate={setEndDate}
                minDate={startDate || undefined}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-5 border-t border-slate-100 bg-slate-50">
          <button
            type="button"
            onClick={handleClearAll}
            className="text-sm font-semibold text-slate-500 hover:text-slate-700"
          >
            Clear all
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="flex items-center gap-2 px-6 py-2.5 bg-[#6b2fa5] text-white font-semibold text-sm rounded-xl shadow-lg shadow-[#6b2fa5]/25 hover:bg-[#5a2690] hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
          >
            Apply Filter
          </button>
        </div>
      </div>
    </div>
  )
}
