"use client"

import { useState, useEffect } from "react"
import { Plus, X, AlertCircle, Ticket, DollarSign, Tag, Check, CalendarClock, ChevronDown, ChevronUp } from "lucide-react"
import { BurdenOfFeeCard, type FeeBurdenState } from "./helper/BurdenOfFeeCard"
import { TicketDateTimePicker } from "./helper/TicketDateTimePicker"
import type { TicketType } from "@/types/ticket"

interface AddPricingProps {
  enablePricing: boolean
  setEnablePricing: (enabled: boolean) => void
  ticketPrices: TicketType[]
  setTicketPrices: (tickets: TicketType[]) => void
  feeBurden: FeeBurdenState
  setFeeBurden: (value: FeeBurdenState) => void
  // "Stop all ticket sales" — moved here from Additional Settings (item 6)
  // so it lives alongside the ticket types it governs.
  enableStopDate: boolean
  setEnableStopDate: (value: boolean) => void
  stopDate: string
  setStopDate: (value: string) => void
  eventDate: string
  getMaxStopDate: () => string
  validateStopDate: () => boolean
}

const emptyTicket: TicketType = { policy: "", price: "", description: "", availableTickets: "" }

export function AddPricing({
  enablePricing,
  setEnablePricing,
  ticketPrices,
  setTicketPrices,
  feeBurden,
  setFeeBurden,
  enableStopDate,
  setEnableStopDate,
  stopDate,
  setStopDate,
  eventDate,
  getMaxStopDate,
  validateStopDate,
}: AddPricingProps) {
  const [errorMessage, setErrorMessage] = useState("")
  const [expandedSaleWindow, setExpandedSaleWindow] = useState<number | null>(null)

  useEffect(() => {
    if (enablePricing && ticketPrices.length === 0) {
      setTicketPrices([{ ...emptyTicket }])
    }
  }, [enablePricing, ticketPrices.length, setTicketPrices])

  useEffect(() => {
    if (!enablePricing) {
      setErrorMessage("")
    }
  }, [enablePricing])

  const handlePricingToggle = () => {
    const newEnablePricing = !enablePricing
    setEnablePricing(newEnablePricing)

    if (!newEnablePricing) {
      setTicketPrices([])
      setErrorMessage("")
    } else {
      setTicketPrices([{ ...emptyTicket }])
    }
  }

  const validateFreeTickets = (tickets: TicketType[]) => {
    const freeTickets = tickets.filter(
      (ticket) =>
        ticket.policy.trim() && (ticket.price === "" || ticket.price === "0" || Number.parseFloat(ticket.price) === 0),
    )

    if (freeTickets.length > 1) {
      setErrorMessage("Only one ticket type can be set as free. You can have multiple paid tickets, but only one free ticket type is allowed.")
      return false
    } else {
      setErrorMessage("")
      return true
    }
  }

  const updateTicket = (index: number, field: keyof TicketType, value: string) => {
    const newTickets = [...ticketPrices]
    newTickets[index] = { ...newTickets[index], [field]: value }
    setTicketPrices(newTickets)

    if (field === "price" || field === "policy") {
      validateFreeTickets(newTickets)
    }
  }

  const addTicketType = () => {
    const newTickets = [...ticketPrices, { ...emptyTicket }]
    setTicketPrices(newTickets)
  }

  const removeTicketType = (index: number) => {
    if (ticketPrices.length > 1) {
      const newTickets = ticketPrices.filter((_, i) => i !== index)
      setTicketPrices(newTickets)
      validateFreeTickets(newTickets)
    }
  }

  const isTicketFree = (price: string) => {
    return price === "" || price === "0" || Number.parseFloat(price) === 0
  }

  const formatNumber = (num: string) => {
    const number = Number.parseInt(num)
    return isNaN(number) ? 0 : number.toLocaleString()
  }

  return (
    <div className="space-y-6">
      {/* Header with Toggle */}
      <div className="flex items-center justify-between p-6 bg-white rounded-xl border-2 border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-12 h-12 bg-gradient-to-br from-[#6b2fa5] to-purple-600 rounded-xl shadow-md">
            <DollarSign className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-900">Event Pricing</h3>
            <p className="text-sm text-slate-600">Configure ticket types and prices</p>
          </div>
        </div>
        
        <label className="relative inline-flex items-center cursor-pointer group">
          <input
            type="checkbox"
            checked={enablePricing}
            onChange={handlePricingToggle}
            className="sr-only peer"
          />
          <div className="w-14 h-7 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#6b2fa5]/20 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-[4px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-[#6b2fa5] shadow-inner"></div>
          <span className="ml-3 text-sm font-semibold text-slate-700 group-hover:text-[#6b2fa5] transition-colors">
            {enablePricing ? 'Enabled' : 'Disabled'}
          </span>
        </label>
      </div>

      {/* Free Event Banner */}
      {!enablePricing && (
        <div className="rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 border-2 border-emerald-200 p-6 shadow-sm animate-in fade-in duration-500">
          <div className="flex items-start gap-4">
            <div className="flex items-center justify-center w-12 h-12 bg-emerald-100 rounded-full flex-shrink-0">
              <Check className="w-6 h-6 text-emerald-600" />
            </div>
            <div className="flex-1">
              <p className="text-lg font-bold text-emerald-900 mb-1">FREE EVENT</p>
              <p className="text-emerald-700 leading-relaxed">
                Your event is set as free. Attendees can get tickets without payment.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Pricing Configuration */}
      {enablePricing && (
        <div className="space-y-6 animate-in fade-in duration-500">
          {/* Error Message */}
          {errorMessage && (
            <div className="flex gap-3 p-4 rounded-xl bg-red-50 border-2 border-red-200 shadow-sm animate-in slide-in-from-top-2 duration-300">
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-red-800 text-sm font-medium">{errorMessage}</p>
            </div>
          )}

          {/* Info Banner */}
          <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 border border-blue-200">
            <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-blue-800 leading-relaxed">
              Configure your ticket types and prices. You can have as many paid tickets as you want, and optionally include{" "}
              <strong>one free ticket</strong> type alongside them. Only one ticket can be set as free.
            </p>
          </div>

          {/* Burden of Fee — item 6 */}
          <BurdenOfFeeCard feeBurden={feeBurden} setFeeBurden={setFeeBurden} />

          {/* Ticket Types */}
          <div className="space-y-4">
            {ticketPrices.map((ticket, index) => (
              <div key={index} className="group relative rounded-xl border-2 border-slate-200 bg-white p-6 space-y-5 hover:border-[#6b2fa5]/30 hover:shadow-lg transition-all duration-300">
                {/* Gradient accent line */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#6b2fa5] via-purple-400 to-[#6b2fa5] rounded-t-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 bg-[#6b2fa5]/10 rounded-lg">
                      <Ticket className="w-5 h-5 text-[#6b2fa5]" />
                    </div>
                    <h4 className="font-bold text-lg text-slate-900">Ticket Type {index + 1}</h4>
                  </div>
                  {ticketPrices.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTicketType(index)}
                      className="p-2 hover:bg-red-50 rounded-lg transition-all duration-200 group/delete"
                      title="Remove ticket type"
                    >
                      <X size={20} className="text-red-600 group-hover/delete:scale-110 transition-transform" />
                    </button>
                  )}
                </div>

                {/* Form Fields */}
                <div className="grid md:grid-cols-2 gap-4">
                  {/* Ticket Name */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Ticket Name <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        placeholder="e.g., VIP, General Admission, At the Gate"
                        value={ticket.policy}
                        onChange={(e) => updateTicket(index, "policy", e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 border-2 border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] focus:border-[#6b2fa5] transition-all duration-200 text-slate-900 placeholder:text-slate-400"
                      />
                    </div>
                  </div>

                  {/* Price */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center justify-between">
                      <span>
                        Price (₦) <span className="text-red-500">*</span>
                      </span>
                      {isTicketFree(ticket.price) && ticket.policy.trim() && (
                        <span className="inline-flex items-center gap-1 text-xs bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full font-bold">
                          <Check className="w-3 h-3" />
                          FREE
                        </span>
                      )}
                    </label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="number"
                        placeholder="0 for free ticket"
                        value={ticket.price}
                        onChange={(e) => updateTicket(index, "price", e.target.value)}
                        min="0"
                        step="0.01"
                        className="w-full pl-10 pr-4 py-2.5 border-2 border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] focus:border-[#6b2fa5] transition-all duration-200 text-slate-900 placeholder:text-slate-400"
                      />
                    </div>
                  </div>
                </div>

                {/* Available Tickets */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Available Tickets</label>
                  <input
                    type="number"
                    placeholder="Leave empty for unlimited"
                    value={ticket.availableTickets}
                    onChange={(e) => updateTicket(index, "availableTickets", e.target.value)}
                    min="1"
                    className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] focus:border-[#6b2fa5] transition-all duration-200 text-slate-900 placeholder:text-slate-400"
                  />
                  {ticket.availableTickets && (
                    <p className="text-xs text-slate-600 mt-2 flex items-center gap-1">
                      <Ticket className="w-3 h-3" />
                      <span className="font-semibold text-[#6b2fa5]">{formatNumber(ticket.availableTickets)}</span> tickets available
                    </p>
                  )}
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Description</label>
                  <textarea
                    placeholder="What does this ticket include? (e.g., VIP lounge access, meet & greet)"
                    value={ticket.description}
                    onChange={(e) => updateTicket(index, "description", e.target.value)}
                    rows={3}
                    className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] focus:border-[#6b2fa5] transition-all duration-200 text-slate-900 placeholder:text-slate-400 resize-none"
                  />
                </div>

                {/* Per-ticket sale window — item 6. Collapsed by default so a
                    simple event doesn't have to look at it, but this is
                    where e.g. "At the Gate" gets told to only go on sale the
                    day of the event. */}
                <div className="pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setExpandedSaleWindow(expandedSaleWindow === index ? null : index)}
                    className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-[#6b2fa5] transition-colors"
                  >
                    <CalendarClock className="w-4 h-4" />
                    Sale window for this ticket type
                    {expandedSaleWindow === index ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  {expandedSaleWindow === index && (
                    <div className="mt-4 grid md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-1 duration-200">
                      <TicketDateTimePicker
                        label="Starts selling"
                        dateValue={ticket.saleStartDate || ""}
                        timeValue={ticket.saleStartTime || ""}
                        onChangeDate={(v) => updateTicket(index, "saleStartDate", v)}
                        onChangeTime={(v) => updateTicket(index, "saleStartTime", v)}
                        maxDate={eventDate || undefined}
                        helperText="Leave blank to go on sale immediately"
                      />
                      <TicketDateTimePicker
                        label="Stops selling"
                        dateValue={ticket.saleEndDate || ""}
                        timeValue={ticket.saleEndTime || ""}
                        onChangeDate={(v) => updateTicket(index, "saleEndDate", v)}
                        onChangeTime={(v) => updateTicket(index, "saleEndTime", v)}
                        maxDate={eventDate || undefined}
                        helperText="Leave blank to follow the event-wide stop date below"
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Add Another Ticket Button */}
          <button
            type="button"
            onClick={addTicketType}
            disabled={!!errorMessage}
            className="group w-full flex items-center justify-center gap-2 px-6 py-4 border-2 border-dashed border-slate-300 rounded-xl text-sm font-semibold text-slate-600 hover:text-[#6b2fa5] hover:border-[#6b2fa5] hover:bg-[#6b2fa5]/5 disabled:opacity-50 disabled:hover:text-slate-600 disabled:hover:border-slate-300 disabled:hover:bg-transparent transition-all duration-200"
          >
            <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
            Add Another Ticket Type
          </button>

          {/* Stop ALL ticket sales — moved from Additional Settings (item 6) */}
          <div className="p-5 rounded-lg border-2 border-slate-200 hover:border-[#6b2fa5]/30 transition-colors bg-white">
            <div className="flex items-center justify-between mb-4">
              <div className="flex-1">
                <label className="text-sm font-semibold text-slate-900 block mb-1">
                  Stop Sale for ALL Ticket Types
                </label>
                <p className="text-xs text-slate-600">
                  Set a single deadline that closes sales across every ticket type at once
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableStopDate}
                  onChange={(e) => {
                    setEnableStopDate(e.target.checked)
                    if (!e.target.checked) setStopDate("")
                  }}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#6b2fa5]/20 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#6b2fa5]"></div>
              </label>
            </div>
            {enableStopDate && (
              <div className="space-y-3">
                <TicketDateTimePicker
                  label="Stop date"
                  dateValue={stopDate ? stopDate.split("T")[0] : ""}
                  timeValue={stopDate ? stopDate.split("T")[1]?.slice(0, 5) || "" : ""}
                  onChangeDate={(d) => setStopDate(`${d}T${stopDate.split("T")[1] || "00:00"}`)}
                  onChangeTime={(t) => setStopDate(`${stopDate.split("T")[0] || eventDate}T${t}`)}
                  maxDate={getMaxStopDate()}
                  disabled={!eventDate}
                />
                {eventDate && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200">
                    <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-blue-800">
                      Stop date must be at least 3 days before event start date. Maximum
                      date: {new Date(getMaxStopDate()).toLocaleDateString()}
                    </p>
                  </div>
                )}
                {stopDate && eventDate && !validateStopDate() && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
                    <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-red-800">
                      Stop date must be at least 3 days before the event start date
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Pricing Summary */}
          {ticketPrices.filter((t) => t.policy.trim()).length > 0 && (
            <div className="rounded-xl border-2 border-[#6b2fa5]/20 bg-gradient-to-br from-[#6b2fa5]/5 to-purple-50 p-6 shadow-sm animate-in fade-in duration-500">
              <h4 className="font-bold text-lg text-slate-900 mb-4 flex items-center gap-2">
                <Ticket className="w-5 h-5 text-[#6b2fa5]" />
                Pricing Summary
              </h4>
              <div className="space-y-3">
                {ticketPrices
                  .filter((t) => t.policy.trim())
                  .map((ticket, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-white rounded-lg border border-[#6b2fa5]/10">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-[#6b2fa5]/10 rounded-lg flex items-center justify-center">
                          <span className="text-xs font-bold text-[#6b2fa5]">{index + 1}</span>
                        </div>
                        <span className="font-semibold text-slate-900">{ticket.policy}</span>
                      </div>
                      <span className="font-bold text-lg text-[#6b2fa5]">
                        {isTicketFree(ticket.price)
                          ? "FREE"
                          : `₦${Number.parseFloat(ticket.price || "0").toLocaleString()}`}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
