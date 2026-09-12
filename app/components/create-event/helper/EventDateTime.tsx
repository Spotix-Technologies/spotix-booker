import React from "react"
import { Calendar, AlertCircle } from "lucide-react"
import { TicketDateTimePicker } from "./TicketDateTimePicker"

interface EventDateTimeProps {
  eventDate: string
  setEventDate: (value: string) => void
  eventStart: string
  setEventStart: (value: string) => void
  eventEndDate: string
  setEventEndDate: (value: string) => void
  eventEnd: string
  setEventEnd: (value: string) => void
  getMinDate: () => string
  validateEndDateTime: () => boolean
}

export function EventDateTime({
  eventDate,
  setEventDate,
  eventStart,
  setEventStart,
  eventEndDate,
  setEventEndDate,
  eventEnd,
  setEventEnd,
  getMinDate,
  validateEndDateTime,
}: EventDateTimeProps) {
  return (
    <div className="space-y-6 rounded-xl border-2 border-slate-200 bg-white p-5 sm:p-6 lg:p-8 shadow-sm">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex items-center justify-center w-10 h-10 bg-[#6b2fa5]/10 rounded-lg">
          <Calendar className="w-5 h-5 text-[#6b2fa5]" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Date & Time</h2>
      </div>

      <div className="space-y-6">
        {/* Event Start Section */}
        <div className="p-5 rounded-lg border-2 border-slate-200 bg-slate-50/50">
          <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
            Event Start
          </h3>
          <TicketDateTimePicker
            label="Starts"
            required
            dateValue={eventDate}
            timeValue={eventStart}
            onChangeDate={setEventDate}
            onChangeTime={setEventStart}
            minDate={getMinDate()}
            helperText="Event must be at least 2 days from today"
          />
        </div>

        {/* Event End Section */}
        <div className="p-5 rounded-lg border-2 border-slate-200 bg-slate-50/50">
          <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500"></div>
            Event End
          </h3>
          <TicketDateTimePicker
            label="Ends"
            required
            dateValue={eventEndDate}
            timeValue={eventEnd}
            onChangeDate={setEventEndDate}
            onChangeTime={setEventEnd}
            minDate={eventDate || getMinDate()}
            disabled={!eventDate || !eventStart}
            helperText={!eventDate || !eventStart ? "Set start date and time first" : undefined}
          />
          {eventEndDate &&
            eventEnd &&
            eventDate &&
            eventStart &&
            !validateEndDateTime() && (
              <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-800">
                  End date and time must be after start date and time
                </p>
              </div>
            )}
        </div>
      </div>
    </div>
  )
}
