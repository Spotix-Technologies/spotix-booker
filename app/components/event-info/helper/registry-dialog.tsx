"use client"

import { useState } from "react"
import { X, FileJson, FileText, Download } from "lucide-react"

interface RegistryDialogProps {
  open: boolean
  onClose: () => void
  onExport: (format: "json" | "csv") => void
  attendeeCount: number
}

export default function RegistryDialog({ open, onClose, onExport, attendeeCount }: RegistryDialogProps) {
  const [selectedFormat, setSelectedFormat] = useState<"json" | "csv" | null>(null)

  if (!open) return null

  const handleExport = () => {
    if (!selectedFormat) return
    onExport(selectedFormat)
    onClose()
    setSelectedFormat(null)
  }

  const handleClose = () => {
    onClose()
    setSelectedFormat(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Dialog */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Download Attendees</h3>
            <p className="text-sm text-slate-500 mt-0.5">
              {attendeeCount} attendee{attendeeCount !== 1 ? "s" : ""} will be exported
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-slate-100 rounded-xl transition-all duration-200 hover:scale-110 active:scale-95"
          >
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        {/* Format Selection */}
        <div className="px-6 py-6">
          <p className="text-sm font-semibold text-slate-700 mb-4 uppercase tracking-wide">
            Choose Export Format
          </p>
          <div className="grid grid-cols-2 gap-4">
            {/* JSON Option */}
            <button
              onClick={() => setSelectedFormat("json")}
              className={`relative flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all duration-200 cursor-pointer group ${
                selectedFormat === "json"
                  ? "border-[#6b2fa5] bg-[#6b2fa5]/5 shadow-md shadow-[#6b2fa5]/10"
                  : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              {selectedFormat === "json" && (
                <span className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-[#6b2fa5]" />
              )}
              <div
                className={`p-3 rounded-xl transition-all duration-200 ${
                  selectedFormat === "json"
                    ? "bg-[#6b2fa5] text-white shadow-lg shadow-[#6b2fa5]/30"
                    : "bg-slate-100 text-slate-500 group-hover:bg-slate-200"
                }`}
              >
                <FileJson size={28} />
              </div>
              <div className="text-center">
                <p className={`text-sm font-bold ${selectedFormat === "json" ? "text-[#6b2fa5]" : "text-slate-700"}`}>
                  JSON
                </p>
                <p className="text-xs text-slate-400 mt-0.5">.json file</p>
              </div>
            </button>

            {/* CSV Option */}
            <button
              onClick={() => setSelectedFormat("csv")}
              className={`relative flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all duration-200 cursor-pointer group ${
                selectedFormat === "csv"
                  ? "border-[#6b2fa5] bg-[#6b2fa5]/5 shadow-md shadow-[#6b2fa5]/10"
                  : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              {selectedFormat === "csv" && (
                <span className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-[#6b2fa5]" />
              )}
              <div
                className={`p-3 rounded-xl transition-all duration-200 ${
                  selectedFormat === "csv"
                    ? "bg-[#6b2fa5] text-white shadow-lg shadow-[#6b2fa5]/30"
                    : "bg-slate-100 text-slate-500 group-hover:bg-slate-200"
                }`}
              >
                <FileText size={28} />
              </div>
              <div className="text-center">
                <p className={`text-sm font-bold ${selectedFormat === "csv" ? "text-[#6b2fa5]" : "text-slate-700"}`}>
                  CSV
                </p>
                <p className="text-xs text-slate-400 mt-0.5">.csv file</p>
              </div>
            </button>
          </div>

          {/* Fields preview */}
          <div className="mt-5 p-4 bg-slate-50 rounded-xl border border-slate-200">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Exported Fields</p>
            <div className="flex flex-wrap gap-2">
              {["fullName", "email", "ticketId", "ticketType"].map((field) => (
                <span
                  key={field}
                  className="inline-flex items-center px-2.5 py-1 bg-white border border-slate-200 text-slate-600 text-xs font-mono rounded-lg"
                >
                  {field}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50">
          <button
            onClick={handleClose}
            className="flex-1 py-2.5 px-4 rounded-xl border-2 border-slate-200 text-slate-700 font-semibold text-sm hover:bg-white transition-all duration-200 hover:border-slate-300"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={!selectedFormat}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-semibold text-sm transition-all duration-200 ${
              selectedFormat
                ? "bg-[#6b2fa5] text-white hover:bg-[#5a2690] shadow-lg shadow-[#6b2fa5]/30 hover:scale-[1.02] active:scale-[0.98]"
                : "bg-slate-200 text-slate-400 cursor-not-allowed"
            }`}
          >
            <Download size={16} />
            Export {selectedFormat ? selectedFormat.toUpperCase() : ""}
          </button>
        </div>
      </div>
    </div>
  )
}