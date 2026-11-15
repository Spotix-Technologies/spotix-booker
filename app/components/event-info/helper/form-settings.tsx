"use client"

import { useState } from "react"
import ResponsiveSheet from "@/components/ui/responsive-sheet"
import { Settings, Ticket, Trash2, AlertTriangle, Check } from "lucide-react"

interface TicketType {
  policy: string
  price: number
}

interface FormSettingsProps {
  ticketTypes: TicketType[]
  ticketSettings: Record<string, boolean>
  onSettingsChange: (settings: Record<string, boolean>) => void
  onDeleteForm: () => void
  hasQuestions: boolean
}

export function FormSettings({
  ticketTypes,
  ticketSettings,
  onSettingsChange,
  onDeleteForm,
  hasQuestions,
}: FormSettingsProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleToggleTicket = (ticketName: string) => {
    const newSettings = {
      ...ticketSettings,
      [ticketName]: !ticketSettings[ticketName],
    }
    onSettingsChange(newSettings)
  }

  const handleConfirmDelete = async () => {
    setIsDeleting(true)
    try {
      await onDeleteForm()
      setShowDeleteDialog(false)
    } catch (error) {
      console.error("Error deleting form:", error)
    } finally {
      setIsDeleting(false)
    }
  }

  const activeTicketsCount = Object.values(ticketSettings).filter(Boolean).length

  if (!hasQuestions) {
    return null
  }

  return (
    <>
      <div className="rounded-xl border-2 border-slate-200 bg-white shadow-sm overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#6b2fa5] to-purple-600 px-6 py-4">
          <div className="flex items-center gap-3 text-white">
            <div className="flex items-center justify-center w-10 h-10 bg-white/20 rounded-lg backdrop-blur-sm">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold">Form Settings</h3>
              <p className="text-sm text-purple-100">Configure which tickets require this form</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Active Tickets Summary */}
          {activeTicketsCount > 0 && (
            <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg">
              <Check className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <p className="text-sm text-emerald-800">
                Form is active for <span className="font-bold">{activeTicketsCount}</span> ticket type
                {activeTicketsCount !== 1 ? "s" : ""}
              </p>
            </div>
          )}

          {activeTicketsCount === 0 && (
            <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <p className="text-sm text-amber-800">No tickets selected. Form will not be shown to attendees.</p>
            </div>
          )}

          {/* Ticket List */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-slate-700 mb-3">Select Ticket Types</h4>
            {ticketTypes.map((ticket) => (
              <div
                key={ticket.policy}
                className="group flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-[#6b2fa5]/30 rounded-lg transition-all duration-200"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="flex items-center justify-center w-10 h-10 bg-white border border-slate-200 rounded-lg flex-shrink-0">
                    <Ticket className="w-5 h-5 text-[#6b2fa5]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{ticket.policy}</p>
                    <p className="text-sm text-slate-600">
                      {ticket.price === 0 ? "FREE" : `₦${ticket.price.toLocaleString()}`}
                    </p>
                  </div>
                </div>

                {/* Toggle Switch */}
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ticketSettings[ticket.policy] || false}
                    onChange={() => handleToggleTicket(ticket.policy)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#6b2fa5]/20 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#6b2fa5] shadow-inner"></div>
                </label>
              </div>
            ))}
          </div>

          {/* Delete Form Button */}
          <div className="pt-4 border-t border-slate-200">
            <button
              onClick={() => setShowDeleteDialog(true)}
              className="group w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-50 hover:bg-red-100 border-2 border-red-200 hover:border-red-300 rounded-lg transition-all duration-200"
            >
              <Trash2 className="w-5 h-5 text-red-600 group-hover:scale-110 transition-transform" />
              <span className="font-semibold text-red-600">Delete Form</span>
            </button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <ResponsiveSheet
        open={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        dismissible={!isDeleting}
        role="alertdialog"
        size="md"
        zIndex={70}
        title="Delete Form"
        icon={
          <div className="flex items-center justify-center w-10 h-10 bg-red-100 rounded-full">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
        }
        footer={
          <div className="flex flex-col-reverse sm:flex-row gap-3">
            <button
              onClick={() => setShowDeleteDialog(false)}
              disabled={isDeleting}
              className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDeleting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-5 h-5" />
                  Delete Form
                </>
              )}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-slate-700 leading-relaxed">
            The form will be deleted for all ticket types. Your existing responses will be stored but no other
            responses can be submitted.
          </p>
          <p className="text-slate-700 font-semibold">Are you sure you want to continue?</p>

          {/* Warning Box */}
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">
              <strong>Warning:</strong> This action cannot be undone. You will need to recreate the form from
              scratch if you change your mind.
            </p>
          </div>
        </div>
      </ResponsiveSheet>
    </>
  )
}
