"use client"

import type React from "react"
import { useState } from "react"
import {
  Tag, Percent, DollarSign, Users, Power, Ticket, TrendingUp,
  Copy, Check, Calendar, Pencil, Layers,
} from "lucide-react"
import ResponsiveSheet from "@/components/ui/responsive-sheet"

export interface DiscountData {
  id?: string
  code: string
  type: "percentage" | "flat"
  value: number
  maxUses: number
  usedCount: number
  active: boolean
  /** Ticket policy names this coupon can be applied to. null/empty = all tickets. */
  applicableTickets?: string[] | null
  /** ISO date string. null = never expires. */
  expiryDate?: string | null
}

interface DiscountsTabProps {
  discounts: DiscountData[]
  newDiscount: any
  /** Ticket policy names available on this event (from eventData.ticketPrices). */
  ticketPolicies: string[]
  /** Policy+price pairs for this event — used to cap a coupon's value against
   *  the ticket(s) it applies to. */
  ticketPrices: { policy: string; price: number }[]
  handleDiscountInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void
  handleAddDiscount: () => void
  handleToggleDiscountStatus: (index: number) => void
  handleEditDiscount: (
    discountId: string,
    updates: { value?: number; maxUses?: number; expiryDate?: string | null; applicableTickets?: string[] | null }
  ) => Promise<void> | void
  setNewDiscount: React.Dispatch<React.SetStateAction<any>>
}

function isExpired(expiryDate?: string | null) {
  if (!expiryDate) return false
  const t = new Date(expiryDate).getTime()
  return Number.isFinite(t) && t < Date.now()
}

// ─── Discount value rules ───────────────────────────────────────────────────
// Mirrors the server-side check in /api/event/list/[eventId] — this copy is
// just for fast UI feedback; the API route is what actually enforces it.
// Percentage discounts are capped at 90%. Flat discounts are capped at 90%
// of the highest-priced ticket tier the coupon applies to (or the event's
// highest tier overall when it isn't scoped to specific tickets).
function getMaxApplicablePrice(
  ticketPrices: { policy: string; price: number }[],
  applicableTickets: string[] | null | undefined
): number {
  const relevant =
    applicableTickets && applicableTickets.length > 0
      ? ticketPrices.filter((t) => applicableTickets.includes(t.policy))
      : ticketPrices
  return relevant.reduce((max, t) => Math.max(max, Number(t.price) || 0), 0)
}

function validateDiscountValue(
  type: "percentage" | "flat",
  value: number | "",
  ticketPrices: { policy: string; price: number }[],
  applicableTickets: string[] | null | undefined
): string | null {
  if (value === "" || value === null || value === undefined) {
    return "Please enter a discount value."
  }
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "Discount value must be a number greater than 0."
  }

  if (type === "percentage") {
    if (numeric > 90) return "Percentage discounts can't exceed 90%."
    return null
  }

  const maxPrice = getMaxApplicablePrice(ticketPrices, applicableTickets)
  if (maxPrice <= 0) return "This event has no priced ticket tiers to discount."
  if (numeric > maxPrice) {
    return `There's no ticket listed that costs that much — the highest applicable ticket is ₦${maxPrice.toLocaleString()}.`
  }
  const cap = maxPrice * 0.9
  if (numeric > cap) {
    return `You can't give away more than 90% of your highest applicable ticket price (₦${cap.toLocaleString()}).`
  }
  return null
}

function TicketScopePicker({
  ticketPolicies,
  selected,
  onChange,
}: {
  ticketPolicies: string[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const allSelected = selected.length === 0

  const toggle = (policy: string) => {
    if (selected.includes(policy)) {
      onChange(selected.filter((p) => p !== policy))
    } else {
      onChange([...selected, policy])
    }
  }

  if (ticketPolicies.length === 0) {
    return <p className="text-xs text-slate-500">This event has no priced ticket tiers yet — coupons will apply to all tickets.</p>
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => onChange([])}
        className={`w-full text-left px-3 py-2 rounded-lg text-sm font-semibold border-2 transition-colors ${
          allSelected
            ? "bg-[#6b2fa5]/10 border-[#6b2fa5] text-[#6b2fa5]"
            : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
        }`}
      >
        All ticket types
      </button>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {ticketPolicies.map((policy) => {
          const checked = selected.includes(policy)
          return (
            <button
              type="button"
              key={policy}
              onClick={() => toggle(policy)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border-2 transition-colors text-left ${
                checked
                  ? "bg-[#6b2fa5]/10 border-[#6b2fa5] text-[#6b2fa5]"
                  : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
              <span
                className={`w-4 h-4 rounded flex items-center justify-center border-2 flex-shrink-0 ${
                  checked ? "bg-[#6b2fa5] border-[#6b2fa5]" : "border-slate-300"
                }`}
              >
                {checked && <Check size={12} className="text-white" />}
              </span>
              <span className="truncate">{policy}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function EditDiscountDialog({
  discount,
  ticketPolicies,
  ticketPrices,
  onCancel,
  onSave,
}: {
  discount: DiscountData
  ticketPolicies: string[]
  ticketPrices: { policy: string; price: number }[]
  onCancel: () => void
  onSave: (updates: { value: number; maxUses: number; expiryDate: string | null; applicableTickets: string[] | null }) => Promise<void> | void
}) {
  const [value, setValue] = useState<number | "">(discount.value)
  const [maxUses, setMaxUses] = useState(discount.maxUses)
  const [expiryDate, setExpiryDate] = useState(discount.expiryDate ? discount.expiryDate.slice(0, 10) : "")
  const [applicableTickets, setApplicableTickets] = useState<string[]>(discount.applicableTickets ?? [])
  const [saving, setSaving] = useState(false)
  const [valueError, setValueError] = useState<string | null>(null)

  const submit = async () => {
    const error = validateDiscountValue(discount.type, value, ticketPrices, applicableTickets)
    if (error) { setValueError(error); return }
    setValueError(null)
    setSaving(true)
    try {
      await onSave({
        value: value === "" ? 0 : value,
        maxUses,
        expiryDate: expiryDate || null,
        applicableTickets: applicableTickets.length > 0 ? applicableTickets : null,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <ResponsiveSheet
      open
      onClose={onCancel}
      dismissible={!saving}
      size="md"
      icon={
        <div className="p-2.5 bg-gradient-to-br from-[#6b2fa5] to-[#8b4fc5] rounded-lg">
          <Pencil size={18} className="text-white" />
        </div>
      }
      title={`Edit ${discount.code}`}
      description="Code and usage count can't be changed here"
      footer={
        <div className="flex flex-col-reverse sm:flex-row gap-3">
          <button
            onClick={onCancel}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#6b2fa5] to-[#8b4fc5] text-white text-sm font-bold hover:shadow-lg transition-all disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-4">
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
              <DollarSign size={16} className="text-[#6b2fa5]" />
              Value {discount.type === "percentage" ? "(%)" : "(₦)"}
            </label>
            <input
              type="number"
              value={value}
              min={0}
              max={discount.type === "percentage" ? 90 : undefined}
              onChange={(e) => {
                const raw = e.target.value
                if (raw !== "" && !/^\d*\.?\d*$/.test(raw)) return
                setValueError(null)
                setValue(raw === "" ? "" : Number(raw))
              }}
              className="w-full px-4 py-2.5 bg-white border-2 border-slate-200 rounded-xl focus:outline-none focus:border-[#6b2fa5] focus:ring-4 focus:ring-[#6b2fa5]/10 transition-all"
            />
            {valueError && <p className="mt-1.5 text-xs font-semibold text-red-600">{valueError}</p>}
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
              <Users size={16} className="text-[#6b2fa5]" />
              Max Uses
            </label>
            <input
              type="number"
              value={maxUses}
              min={discount.usedCount || 1}
              onChange={(e) => setMaxUses(Number(e.target.value))}
              className="w-full px-4 py-2.5 bg-white border-2 border-slate-200 rounded-xl focus:outline-none focus:border-[#6b2fa5] focus:ring-4 focus:ring-[#6b2fa5]/10 transition-all"
            />
          </div>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
            <Calendar size={16} className="text-[#6b2fa5]" />
            Expiry Date (optional)
          </label>
          <div className="flex gap-2">
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="flex-1 px-4 py-2.5 bg-white border-2 border-slate-200 rounded-xl focus:outline-none focus:border-[#6b2fa5] focus:ring-4 focus:ring-[#6b2fa5]/10 transition-all"
            />
            {expiryDate && (
              <button
                type="button"
                onClick={() => setExpiryDate("")}
                className="px-4 py-2.5 rounded-xl border-2 border-slate-200 text-sm font-semibold text-slate-500 hover:bg-slate-50"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
            <Layers size={16} className="text-[#6b2fa5]" />
            Applies To
          </label>
          <TicketScopePicker ticketPolicies={ticketPolicies} selected={applicableTickets} onChange={setApplicableTickets} />
        </div>
      </div>
    </ResponsiveSheet>
  )
}

export default function DiscountsTab({
  discounts,
  newDiscount,
  ticketPolicies,
  ticketPrices,
  handleDiscountInputChange,
  handleAddDiscount,
  handleToggleDiscountStatus,
  handleEditDiscount,
  setNewDiscount,
}: DiscountsTabProps) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [valueError, setValueError] = useState<string | null>(null)

  const activeDiscounts = discounts.filter((d) => d.active && !isExpired(d.expiryDate)).length
  const totalUsage = discounts.reduce((sum, d) => sum + d.usedCount, 0)

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedCode(code)
      setTimeout(() => setCopiedCode((c) => (c === code ? null : c)), 1500)
    } catch {
      // clipboard API unavailable — silently ignore, code is still visible/selectable
    }
  }

  const newDiscountTickets: string[] = newDiscount.applicableTickets ?? []

  const handleValueChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setValueError(null)
    handleDiscountInputChange(e)
  }

  const handleCreateClick = () => {
    const error = validateDiscountValue(newDiscount.type, newDiscount.value, ticketPrices, newDiscountTickets)
    if (error) { setValueError(error); return }
    setValueError(null)
    handleAddDiscount()
  }

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-[#6b2fa5] to-[#8b4fc5] rounded-xl p-5 text-white shadow-lg shadow-[#6b2fa5]/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-purple-100">Total Codes</p>
              <p className="text-3xl font-bold mt-1">{discounts.length}</p>
            </div>
            <Ticket size={32} className="text-purple-200" />
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border-2 border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600">Active Codes</p>
              <p className="text-3xl font-bold text-green-600 mt-1">{activeDiscounts}</p>
            </div>
            <Power size={32} className="text-green-500" />
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border-2 border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600">Total Usage</p>
              <p className="text-3xl font-bold text-blue-600 mt-1">{totalUsage}</p>
            </div>
            <TrendingUp size={32} className="text-blue-500" />
          </div>
        </div>
      </div>

      {/* Create Discount Form */}
      <div className="bg-white rounded-xl border-2 border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow duration-200">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 bg-gradient-to-br from-[#6b2fa5] to-[#8b4fc5] rounded-lg">
            <Tag size={20} className="text-white" />
          </div>
          <h3 className="text-xl font-bold text-slate-900">Create New Discount Code</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
              <Tag size={16} className="text-[#6b2fa5]" />
              Discount Code
            </label>
            <input
              type="text"
              name="code"
              value={newDiscount.code}
              onChange={handleDiscountInputChange}
              placeholder="e.g. SUMMER20, EARLYBIRD"
              className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl focus:outline-none focus:border-[#6b2fa5] focus:ring-4 focus:ring-[#6b2fa5]/10 transition-all duration-200 uppercase placeholder:normal-case"
              required
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
              <Percent size={16} className="text-[#6b2fa5]" />
              Discount Type
            </label>
            <select
              name="type"
              value={newDiscount.type}
              onChange={handleValueChange}
              className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl focus:outline-none focus:border-[#6b2fa5] focus:ring-4 focus:ring-[#6b2fa5]/10 transition-all duration-200 appearance-none cursor-pointer"
            >
              <option value="percentage">Percentage (%)</option>
              <option value="flat">Flat Amount (₦)</option>
            </select>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
              <DollarSign size={16} className="text-[#6b2fa5]" />
              Discount Value
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                name="value"
                value={newDiscount.value}
                onChange={handleValueChange}
                min="0"
                max={newDiscount.type === "percentage" ? 90 : undefined}
                placeholder="Enter value"
                inputMode="decimal"
                className="flex-1 px-4 py-3 bg-white border-2 border-slate-200 rounded-xl focus:outline-none focus:border-[#6b2fa5] focus:ring-4 focus:ring-[#6b2fa5]/10 transition-all duration-200"
                required
              />
              <div className="px-5 py-3 bg-gradient-to-br from-[#6b2fa5]/10 to-[#8b4fc5]/10 border-2 border-[#6b2fa5]/20 rounded-xl flex items-center font-bold text-[#6b2fa5] min-w-[60px] justify-center">
                {newDiscount.type === "percentage" ? "%" : "₦"}
              </div>
            </div>
            {valueError && <p className="mt-1.5 text-xs font-semibold text-red-600">{valueError}</p>}
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
              <Users size={16} className="text-[#6b2fa5]" />
              Maximum Uses
            </label>
            <input
              type="number"
              name="maxUses"
              value={newDiscount.maxUses}
              onChange={handleDiscountInputChange}
              min="1"
              placeholder="How many times can it be used?"
              className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl focus:outline-none focus:border-[#6b2fa5] focus:ring-4 focus:ring-[#6b2fa5]/10 transition-all duration-200"
              required
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
              <Calendar size={16} className="text-[#6b2fa5]" />
              Expiry Date (optional)
            </label>
            <input
              type="date"
              name="expiryDate"
              value={newDiscount.expiryDate ?? ""}
              onChange={handleDiscountInputChange}
              className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl focus:outline-none focus:border-[#6b2fa5] focus:ring-4 focus:ring-[#6b2fa5]/10 transition-all duration-200"
            />
          </div>
        </div>

        <div className="mb-6">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
            <Layers size={16} className="text-[#6b2fa5]" />
            Applies To
          </label>
          <TicketScopePicker
            ticketPolicies={ticketPolicies}
            selected={newDiscountTickets}
            onChange={(next) => setNewDiscount((prev: any) => ({ ...prev, applicableTickets: next }))}
          />
        </div>

        <button
          type="button"
          onClick={handleCreateClick}
          className="w-full px-6 py-4 bg-gradient-to-r from-[#6b2fa5] to-[#8b4fc5] text-white rounded-xl font-bold hover:shadow-lg hover:shadow-[#6b2fa5]/30 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
        >
          ✨ Create Discount Code
        </button>
      </div>

      {/* Discounts Table */}
      <div className="bg-white rounded-xl border-2 border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-slate-50 to-slate-100 border-b-2 border-slate-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Code</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Type</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Value</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Applies To</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Expiry</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Usage</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {discounts.length > 0 ? (
                discounts.map((discount, index) => {
                  const usagePercentage = (discount.usedCount / discount.maxUses) * 100
                  const expired = isExpired(discount.expiryDate)
                  const scope = discount.applicableTickets
                  return (
                    <tr
                      key={discount.id ?? index}
                      className="hover:bg-slate-50 transition-colors duration-200"
                    >
                      <td className="px-6 py-4">
                        <button
                          type="button"
                          onClick={() => copyCode(discount.code)}
                          title="Click to copy"
                          className="flex items-center gap-2 group"
                        >
                          <div className="p-2 bg-gradient-to-br from-[#6b2fa5]/10 to-[#8b4fc5]/10 rounded-lg">
                            <Tag size={16} className="text-[#6b2fa5]" />
                          </div>
                          <span className="text-sm font-bold text-slate-900 uppercase group-hover:text-[#6b2fa5] transition-colors">
                            {discount.code}
                          </span>
                          {copiedCode === discount.code ? (
                            <Check size={14} className="text-green-600 flex-shrink-0" />
                          ) : (
                            <Copy size={14} className="text-slate-400 group-hover:text-[#6b2fa5] flex-shrink-0" />
                          )}
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold border border-slate-200">
                          {discount.type === "percentage" ? (
                            <>
                              <Percent size={14} />
                              Percentage
                            </>
                          ) : (
                            <>
                              <DollarSign size={14} />
                              Flat Amount
                            </>
                          )}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-lg font-bold text-[#6b2fa5]">
                          {discount.type === "percentage" ? `${discount.value}%` : `₦${discount.value.toLocaleString()}`}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {scope && scope.length > 0 ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 text-[#6b2fa5] rounded-lg text-xs font-semibold border border-purple-200 max-w-[160px]">
                            <Layers size={12} className="flex-shrink-0" />
                            <span className="truncate">{scope.join(", ")}</span>
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500">All tickets</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {discount.expiryDate ? (
                          <span className={`text-xs font-semibold ${expired ? "text-red-600" : "text-slate-600"}`}>
                            {new Date(discount.expiryDate).toLocaleDateString()}
                            {expired && " (expired)"}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">Never</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-slate-700">
                              {discount.usedCount} / {discount.maxUses}
                            </span>
                            <span className="text-slate-500">{Math.round(usagePercentage)}%</span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-gradient-to-r from-[#6b2fa5] to-[#8b4fc5] h-full rounded-full transition-all duration-300"
                              style={{ width: `${Math.min(usagePercentage, 100)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${
                            discount.active && !expired
                              ? "bg-green-50 text-green-700 border border-green-200"
                              : "bg-slate-100 text-slate-700 border border-slate-200"
                          }`}
                        >
                          <div className={`w-2 h-2 rounded-full ${discount.active && !expired ? "bg-green-500" : "bg-slate-400"}`} />
                          {expired ? "Expired" : discount.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setEditingIndex(index)}
                            className="p-2 rounded-lg text-xs font-bold transition-all duration-200 hover:scale-105 active:scale-95 bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200"
                            title="Edit coupon"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => handleToggleDiscountStatus(index)}
                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 hover:scale-105 active:scale-95 ${
                              discount.active
                                ? "bg-red-100 text-red-700 hover:bg-red-200 border border-red-200"
                                : "bg-green-100 text-green-700 hover:bg-green-200 border border-green-200"
                            }`}
                          >
                            {discount.active ? "🔴 Deactivate" : "🟢 Activate"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
                        <Tag size={32} className="text-slate-400" />
                      </div>
                      <p className="text-slate-600 font-medium">No discount codes created yet</p>
                      <p className="text-sm text-slate-500">Create your first discount code to get started</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editingIndex !== null && discounts[editingIndex] && (
        <EditDiscountDialog
          discount={discounts[editingIndex]}
          ticketPolicies={ticketPolicies}
          ticketPrices={ticketPrices}
          onCancel={() => setEditingIndex(null)}
          onSave={async (updates) => {
            const target = discounts[editingIndex]
            if (target.id) await handleEditDiscount(target.id, updates)
            setEditingIndex(null)
          }}
        />
      )}
    </div>
  )
}
