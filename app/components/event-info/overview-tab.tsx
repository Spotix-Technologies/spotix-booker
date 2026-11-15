"use client"
import { useState } from "react"
import { Copy, Check, TrendingUp, Wallet, Users, DollarSign, Vote, Link2, ExternalLink, Percent, Loader2, AlertCircle, Settings2, CreditCard } from "lucide-react"
import ResponsiveSheet from "@/components/ui/responsive-sheet"
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { MaskedAmount } from "@/components/ui/masked-amount"
import { SalesTrendBadge } from "@/components/ui/sales-trend-badge"
import { InlineTrend } from "@/components/ui/inline-trend"
import VirtualQueueNotice from "./virtual-queue-notice"
import { useChartReady } from "@/hooks/useChartReady"

interface OverviewTabProps {
  eventData: any
  availableBalance: number
  totalPaidOut: number
  copiedField: string | null
  bookerBVT: string
  ticketSalesByDay: any[]
  ticketTypeData: any[]
  salesTrend?: { pct: number | null; tone: "up" | "down" | "flat" } | null
  ticketCountTrend?: { pct: number | null; tone: "up" | "down" | "flat" } | null
  copyToClipboard: (text: string, field: string) => void
  eventId: string
  /** Owner or Admin collaborator only — everyone else sees the current
   *  setting read-only. Enforced again server-side regardless. */
  canEditFeeBurden: boolean
}

export default function OverviewTab({
  eventData,
  availableBalance,
  totalPaidOut,
  copiedField,
  bookerBVT,
  ticketSalesByDay,
  ticketTypeData,
  salesTrend,
  ticketCountTrend,
  copyToClipboard,
  eventId,
  canEditFeeBurden,
}: OverviewTabProps) {
  // Two independent switches rather than one toggle — mirrors
  // resolveFeeBurden() in spotix-user's priceUtility.ts. Legacy events
  // that only ever had `buyerBearsBurden` (before Paystack's fee was
  // split out as its own concept) map onto this the same way: false
  // meant "organizer covers Spotix's fee", Paystack's stayed attendee-owed.
  const resolveFeeBurden = (ev: any): { coversPaystackFee: boolean; coversSpotixFee: boolean } => {
    if (ev?.feeBurden && typeof ev.feeBurden === "object") {
      return {
        coversPaystackFee: ev.feeBurden.coversPaystackFee === true,
        coversSpotixFee: ev.feeBurden.coversSpotixFee === true,
      }
    }
    return { coversPaystackFee: false, coversSpotixFee: ev?.buyerBearsBurden === false }
  }

  // This tab renders inside a CSS grid column (see the two-up "Charts
  // Section" grid below), so on first mount the grid may not have
  // resolved a column width yet — ResponsiveContainer would measure
  // 0 and recharts would log the "width(-1) and height(-1)" warning.
  // Wait one tick so the charts only mount once layout is settled.
  const chartReady = useChartReady()

  const [feeBurden, setFeeBurden] = useState(resolveFeeBurden(eventData))
  const [savedFeeBurden, setSavedFeeBurden] = useState(resolveFeeBurden(eventData))
  const [savingBurden, setSavingBurden] = useState(false)
  const [burdenError, setBurdenError] = useState("")
  const [burdenGearOpen, setBurdenGearOpen] = useState(false)
  const [draftFeeBurden, setDraftFeeBurden] = useState(feeBurden)

  const handleSaveFeeBurden = async (next: { coversPaystackFee: boolean; coversSpotixFee: boolean }) => {
    setFeeBurden(next) // optimistic — reverted below on failure
    setSavingBurden(true)
    setBurdenError("")
    try {
      const res = await fetch(`/api/event/list/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setFeeBurden", feeBurden: next }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setBurdenError(data.error || "Failed to update fee burden")
        setFeeBurden(savedFeeBurden)
        return
      }
      setSavedFeeBurden(next)
      setBurdenGearOpen(false)
    } catch {
      setBurdenError("Something went wrong. Please try again")
      setFeeBurden(savedFeeBurden)
    } finally {
      setSavingBurden(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Hero Image with Gradient Overlay */}
      <div className="relative bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-lg group">
        <div className="absolute inset-0 bg-gradient-to-t from-[#6b2fa5]/80 via-[#6b2fa5]/20 to-transparent z-10" />
        <img
          src={eventData.eventImage || "/placeholder.svg?height=300&width=800&query=event+image"}
          alt={eventData.eventName}
          className="w-full h-96 object-cover transition-transform duration-700 group-hover:scale-105"
        />
        <div className="absolute bottom-0 left-0 right-0 p-8 z-20">
          <h2 className="text-3xl font-bold text-white mb-2 drop-shadow-lg">{eventData.eventName}</h2>
          <p className="text-white/90 drop-shadow-md">
            {new Date(eventData.eventDate).toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </p>
        </div>
      </div>

      {/* Virtual Queue Notice — only renders when admin has it enabled */}
      <VirtualQueueNotice eventData={eventData} />

      {/* Stats Grid - Enhanced with icons and animations */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Tickets Sold Stat */}
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-1">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-slate-600 text-sm font-semibold uppercase tracking-wide">Tickets Sold</h3>
            <div className="p-2 bg-[#6b2fa5]/10 rounded-lg">
              <Users className="w-5 h-5 text-[#6b2fa5]" />
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-900 mb-2">
            {eventData.ticketsSold}
            {eventData.enableMaxSize && eventData.maxSize && (
              <span className="text-lg text-slate-500 font-medium"> / {eventData.maxSize}</span>
            )}
          </p>
          {eventData.enableMaxSize && eventData.maxSize && (
            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-[#6b2fa5] to-[#8b4fc5] h-2.5 rounded-full transition-all duration-500 ease-out shadow-sm"
                style={{
                  width: `${(eventData.ticketsSold / eventData.maxSize) * 100}%`,
                }}
              />
            </div>
          )}
          {eventData.enableMaxSize && eventData.maxSize && (
            <p className="text-xs text-slate-500 mt-2">
              {((eventData.ticketsSold / eventData.maxSize) * 100).toFixed(1)}% capacity
            </p>
          )}
          {ticketCountTrend && <InlineTrend pct={ticketCountTrend.pct} tone={ticketCountTrend.tone} />}
        </div>

        {/* Revenue Stat */}
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-1">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-slate-600 text-sm font-semibold uppercase tracking-wide">Total Revenue</h3>
            <div className="p-2 bg-emerald-50 rounded-lg">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-900">
            <MaskedAmount value={`₦${eventData.totalRevenue.toLocaleString()}`} size="xl" className="text-slate-900" />
          </p>
          <p className="text-xs text-slate-500 mt-2">All ticket sales</p>
          {salesTrend && <InlineTrend pct={salesTrend.pct} tone={salesTrend.tone} />}
        </div>

        {/* Available Balance Stat - Highlighted */}
        <div className="bg-gradient-to-br from-[#6b2fa5] to-[#8b4fc5] rounded-xl p-6 border border-[#6b2fa5] shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 hover:scale-[1.02]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white/90 text-sm font-semibold uppercase tracking-wide">Available Balance</h3>
            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
              <Wallet className="w-5 h-5 text-white" />
            </div>
          </div>
          <p className="text-3xl font-bold text-white">
            <MaskedAmount value={`₦${availableBalance.toLocaleString()}`} size="xl" className="text-white" iconClassName="text-white/50 hover:text-white" />
          </p>
          <p className="text-xs text-white/80 mt-2">Ready to withdraw</p>
        </div>

        {/* Paid Out Stat */}
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-1">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-slate-600 text-sm font-semibold uppercase tracking-wide">Total Paid Out</h3>
            <div className="p-2 bg-blue-50 rounded-lg">
              <DollarSign className="w-5 h-5 text-blue-600" />
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-900">
            <MaskedAmount value={`₦${totalPaidOut.toLocaleString()}`} size="xl" className="text-slate-900" />
          </p>
          <p className="text-xs text-slate-500 mt-2">Withdrawn to date</p>
        </div>
      </div>

      {/* Available Tickets - Enhanced Cards */}
      {eventData.ticketPrices && eventData.ticketPrices.length > 0 && (
        <div className="bg-white rounded-xl p-8 border border-slate-200 shadow-sm">
          <h3 className="text-xl font-bold text-slate-900 mb-6">Available Tickets</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {eventData.ticketPrices.map((ticket: any, index: number) => (
              <div
                key={index}
                className="group relative flex items-center justify-between p-5 bg-gradient-to-br from-slate-50 to-slate-100/50 rounded-xl border border-slate-200 hover:border-[#6b2fa5] hover:shadow-md transition-all duration-300 overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-[#6b2fa5]/0 to-[#6b2fa5]/0 group-hover:from-[#6b2fa5]/5 group-hover:to-[#6b2fa5]/10 transition-all duration-300" />
                <div className="flex-1 relative z-10">
                  <p className="font-bold text-slate-900 text-lg mb-1">{ticket.policy || `Ticket Type ${index + 1}`}</p>
                  <p className="text-sm text-slate-600">Price per ticket</p>
                </div>
                <div className="text-right relative z-10">
                  <p className="text-2xl font-bold text-[#6b2fa5] group-hover:scale-110 transition-transform duration-300">
                    ₦{Number(ticket.price).toLocaleString()}
                  </p>
                  <p className="text-xs text-slate-600 mt-1">Per ticket</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payment Requisites - Enhanced with better visual hierarchy */}
      <div className="bg-white rounded-xl p-8 border border-slate-200 shadow-sm">
        <h3 className="text-xl font-bold text-slate-900 mb-6">Payment Requisites</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Event ID Field */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700 uppercase tracking-wide">Event ID</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={eventData.id}
                readOnly
                className="flex-1 px-4 py-3 border border-slate-300 rounded-lg bg-slate-50 text-slate-700 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] focus:border-transparent transition-all"
              />
              <button
                onClick={() => copyToClipboard(eventData.id, "eventId")}
                className="p-3 hover:bg-[#6b2fa5]/10 rounded-lg transition-all duration-200 text-slate-600 hover:text-[#6b2fa5] border border-slate-200 hover:border-[#6b2fa5]"
              >
                {copiedField === "eventId" ? (
                  <Check size={20} className="text-emerald-600" />
                ) : (
                  <Copy size={20} />
                )}
              </button>
            </div>
          </div>

          {/* Pay ID Field */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700 uppercase tracking-wide">Pay ID</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={eventData.payId || "Not set"}
                readOnly
                className="flex-1 px-4 py-3 border border-slate-300 rounded-lg bg-slate-50 text-slate-700 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] focus:border-transparent transition-all"
              />
              <button
                onClick={() => copyToClipboard(eventData.payId || "", "payId")}
                className="p-3 hover:bg-[#6b2fa5]/10 rounded-lg transition-all duration-200 text-slate-600 hover:text-[#6b2fa5] border border-slate-200 hover:border-[#6b2fa5]"
              >
                {copiedField === "payId" ? (
                  <Check size={20} className="text-emerald-600" />
                ) : (
                  <Copy size={20} />
                )}
              </button>
            </div>
          </div>

          {/* BVT Field */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700 uppercase tracking-wide">BVT</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={bookerBVT || "Not verified"}
                readOnly
                className="flex-1 px-4 py-3 border border-slate-300 rounded-lg bg-slate-50 text-slate-700 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] focus:border-transparent transition-all"
              />
              <button
                onClick={() => copyToClipboard(bookerBVT || "", "bvt")}
                className="p-3 hover:bg-[#6b2fa5]/10 rounded-lg transition-all duration-200 text-slate-600 hover:text-[#6b2fa5] border border-slate-200 hover:border-[#6b2fa5]"
              >
                {copiedField === "bvt" ? (
                  <Check size={20} className="text-emerald-600" />
                ) : (
                  <Copy size={20} />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Burden of Fee */}
      <div className="bg-white rounded-xl p-8 border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#6b2fa5]/10 rounded-lg">
              <Percent className="w-5 h-5 text-[#6b2fa5]" />
            </div>
            <h3 className="text-xl font-bold text-slate-900">Burden of Fee</h3>
          </div>
          {canEditFeeBurden && (
            <button
              type="button"
              onClick={() => { setDraftFeeBurden(feeBurden); setBurdenGearOpen(true) }}
              disabled={savingBurden}
              title="Customize which fee you cover"
              className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-[#6b2fa5] hover:border-[#6b2fa5]/40 hover:bg-[#6b2fa5]/5 transition-colors disabled:opacity-50"
            >
              <Settings2 className="w-4 h-4" />
            </button>
          )}
        </div>
        <p className="text-sm text-slate-500 mb-6 max-w-2xl">
          Who pays the fees on every ticket sold for this event, going forward — Spotix's platform fee, Paystack's
          own processing fee, or both. This never changes what a ticket already sold was charged. Use the gear icon
          to cover just one of the two instead of an all-or-nothing choice.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            type="button"
            disabled={!canEditFeeBurden || savingBurden}
            onClick={() => handleSaveFeeBurden({ coversPaystackFee: false, coversSpotixFee: false })}
            className={`text-left p-5 rounded-xl border-2 transition-all duration-200 disabled:cursor-not-allowed ${
              !feeBurden.coversPaystackFee && !feeBurden.coversSpotixFee
                ? "border-[#6b2fa5] bg-[#6b2fa5]/5"
                : "border-slate-200 bg-white hover:border-slate-300"
            } ${!canEditFeeBurden ? "opacity-70" : ""}`}
          >
            <div className="flex items-center justify-between mb-1">
              <p className="font-bold text-slate-900">Attendees pay the fees</p>
              {!feeBurden.coversPaystackFee && !feeBurden.coversSpotixFee && <Check size={18} className="text-[#6b2fa5]" />}
            </div>
            <p className="text-xs text-slate-500">
              Both fees are added on top of the ticket price at checkout. You receive the full ticket price.
              This is the default.
            </p>
          </button>

          <button
            type="button"
            disabled={!canEditFeeBurden || savingBurden}
            onClick={() => handleSaveFeeBurden({ coversPaystackFee: true, coversSpotixFee: true })}
            className={`text-left p-5 rounded-xl border-2 transition-all duration-200 disabled:cursor-not-allowed ${
              feeBurden.coversPaystackFee && feeBurden.coversSpotixFee
                ? "border-[#6b2fa5] bg-[#6b2fa5]/5"
                : "border-slate-200 bg-white hover:border-slate-300"
            } ${!canEditFeeBurden ? "opacity-70" : ""}`}
          >
            <div className="flex items-center justify-between mb-1">
              <p className="font-bold text-slate-900">You cover both fees</p>
              {feeBurden.coversPaystackFee && feeBurden.coversSpotixFee && <Check size={18} className="text-[#6b2fa5]" />}
            </div>
            <p className="text-xs text-slate-500">
              Attendees pay exactly the ticket price you set — nothing added. Both fees come out of your revenue
              at payout time.
            </p>
          </button>
        </div>

        {/* Custom split summary — only shown when neither preset above matches */}
        {(feeBurden.coversPaystackFee !== feeBurden.coversSpotixFee) && (
          <div className="mt-4 rounded-xl border border-[#6b2fa5]/30 bg-[#6b2fa5]/5 p-4 flex items-start gap-3">
            <Settings2 className="w-4 h-4 text-[#6b2fa5] shrink-0 mt-0.5" />
            <p className="text-sm text-slate-700">
              <span className="font-semibold">Custom split:</span> you cover{" "}
              {feeBurden.coversPaystackFee ? "Paystack's processing fee" : "Spotix's platform fee"}, attendees cover{" "}
              {feeBurden.coversPaystackFee ? "Spotix's platform fee" : "Paystack's processing fee"}.
            </p>
          </div>
        )}

        {savingBurden && (
          <p className="flex items-center gap-2 text-xs text-slate-500 mt-4">
            <Loader2 size={14} className="animate-spin" /> Saving…
          </p>
        )}
        {burdenError && (
          <p className="flex items-center gap-2 text-xs text-red-600 mt-4">
            <AlertCircle size={14} /> {burdenError}
          </p>
        )}
        {!canEditFeeBurden && (
          <p className="text-xs text-slate-400 mt-4">Only the organizer or an Admin collaborator can change this.</p>
        )}
      </div>

      {/* Burden of Fee — granular gear modal */}
      {burdenGearOpen && (
        <ResponsiveSheet
          open
          onClose={() => setBurdenGearOpen(false)}
          size="md"
          icon={<Settings2 className="w-5 h-5 text-[#6b2fa5] mt-0.5" />}
          title="Customize Burden of Fee"
          footer={
            <button
                onClick={() => handleSaveFeeBurden(draftFeeBurden)}
                disabled={savingBurden}
                className="w-full py-2.5 text-sm font-semibold rounded-lg bg-[#6b2fa5] text-white hover:bg-[#5a2589] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {savingBurden && <Loader2 className="w-4 h-4 animate-spin" />}
                Save
              </button>
          }
        >
          <div className="space-y-5">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <CreditCard className="w-4 h-4 text-slate-500" />
              <p className="text-sm font-semibold text-slate-800">Paystack's processing fee</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDraftFeeBurden((d) => ({ ...d, coversPaystackFee: false }))}
                className={`text-xs font-semibold py-2.5 rounded-lg border transition-colors ${!draftFeeBurden.coversPaystackFee ? "border-[#6b2fa5] bg-[#6b2fa5]/5 text-[#6b2fa5]" : "border-slate-200 text-slate-500"}`}
              >
                Attendee pays
              </button>
              <button
                type="button"
                onClick={() => setDraftFeeBurden((d) => ({ ...d, coversPaystackFee: true }))}
                className={`text-xs font-semibold py-2.5 rounded-lg border transition-colors ${draftFeeBurden.coversPaystackFee ? "border-[#6b2fa5] bg-[#6b2fa5]/5 text-[#6b2fa5]" : "border-slate-200 text-slate-500"}`}
              >
                You pay
              </button>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <Percent className="w-4 h-4 text-slate-500" />
              <p className="text-sm font-semibold text-slate-800">Spotix's platform fee</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDraftFeeBurden((d) => ({ ...d, coversSpotixFee: false }))}
                className={`text-xs font-semibold py-2.5 rounded-lg border transition-colors ${!draftFeeBurden.coversSpotixFee ? "border-[#6b2fa5] bg-[#6b2fa5]/5 text-[#6b2fa5]" : "border-slate-200 text-slate-500"}`}
              >
                Attendee pays
              </button>
              <button
                type="button"
                onClick={() => setDraftFeeBurden((d) => ({ ...d, coversSpotixFee: true }))}
                className={`text-xs font-semibold py-2.5 rounded-lg border transition-colors ${draftFeeBurden.coversSpotixFee ? "border-[#6b2fa5] bg-[#6b2fa5]/5 text-[#6b2fa5]" : "border-slate-200 text-slate-500"}`}
              >
                You pay
              </button>
            </div>
          </div>

          <p className="text-xs text-slate-400">
            If an attendee ends up owing at least one fee, checkout shows them a "Fee breakdown" so it's always
            clear what they're paying for.
          </p>
          </div>
        </ResponsiveSheet>
      )}

      {/* Event Description - Enhanced readability */}
      <div className="bg-gradient-to-br from-white to-slate-50 rounded-xl p-8 border border-slate-200 shadow-sm">
        <h3 className="text-xl font-bold text-slate-900 mb-4">Event Description</h3>
        <p className="text-slate-700 leading-relaxed text-base">{eventData.eventDescription}</p>
      </div>

      {/* Charts Section - Enhanced styling */}
      {ticketTypeData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Ticket Sales Chart */}
          <div className="bg-white rounded-xl p-8 border border-slate-200 shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
              <h4 className="text-xl font-bold text-slate-900">Ticket Sales Over Time</h4>
              {salesTrend && <SalesTrendBadge pct={salesTrend.pct} tone={salesTrend.tone} metric="ticket sales" />}
            </div>
            {ticketSalesByDay.length > 0 ? (
              !chartReady ? (
                <div className="h-[320px]" />
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <AreaChart data={ticketSalesByDay}>
                    <defs>
                      <linearGradient id="colorTickets" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6b2fa5" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#6b2fa5" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis 
                      dataKey="date" 
                      stroke="#64748b" 
                      style={{ fontSize: '12px' }}
                    />
                    <YAxis 
                      stroke="#64748b" 
                      style={{ fontSize: '12px' }}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'white', 
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                      }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="count" 
                      name="Tickets Sold" 
                      stroke="#6b2fa5" 
                      strokeWidth={3}
                      fill="url(#colorTickets)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )
            ) : (
              <div className="flex items-center justify-center py-20">
                <p className="text-slate-500 text-center">No sales data available yet</p>
              </div>
            )}
          </div>

          {/* Ticket Types Chart */}
          <div className="bg-white rounded-xl p-8 border border-slate-200 shadow-sm hover:shadow-md transition-shadow duration-300">
            <h4 className="text-xl font-bold text-slate-900 mb-6">Ticket Types Distribution</h4>
            {ticketTypeData.length > 0 ? (
              !chartReady ? (
                <div className="h-[320px]" />
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={ticketTypeData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis 
                      dataKey="type" 
                      stroke="#64748b" 
                      style={{ fontSize: '12px' }}
                    />
                    <YAxis 
                      stroke="#64748b" 
                      style={{ fontSize: '12px' }}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'white', 
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                      }}
                    />
                    <Bar 
                      dataKey="count" 
                      fill="#6b2fa5" 
                      name="Tickets Sold" 
                      radius={[8, 8, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )
            ) : (
              <div className="flex items-center justify-center py-20">
                <p className="text-slate-500 text-center">No ticket type data available</p>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Linked Poll section */}
      {eventData.votingId && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">Linked Poll</h3>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#6b2fa5]/10 flex items-center justify-center flex-shrink-0">
                <Vote className="w-5 h-5 text-[#6b2fa5]" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">{eventData.votingPollName || "Linked Poll"}</p>
                <p className="text-xs text-slate-400 font-mono">{eventData.votingId}</p>
              </div>
            </div>
            <a
              href={`https://spotix.com.ng/polls/${encodeURIComponent(eventData.votingPollName || eventData.votingId)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 bg-[#6b2fa5]/10 text-[#6b2fa5] hover:bg-[#6b2fa5]/20 rounded-xl text-xs font-semibold transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View Poll
            </a>
          </div>
        </div>
      )}
    </div>
  )
}