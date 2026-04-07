"use client"

import { useState, useMemo } from "react"
import { User, Mail, ShoppingCart, Shield, ChevronUp, Search, Filter, Download } from "lucide-react"
import RegistryDialog from "./helper/registry-dialog"

interface AttendeeData {
  id: string
  fullName: string
  email: string
  ticketType: string
  verified: boolean
  purchaseDate: string
  purchaseTime: string
  ticketReference: string
}

interface AttendeesTabProps {
  attendees: AttendeeData[]
  formatFirestoreTimestamp: (timestamp: any) => string
  eventId: string
}

export default function AttendeesTab({ attendees, formatFirestoreTimestamp, eventId }: AttendeesTabProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [verificationFilter, setVerificationFilter] = useState<"all" | "verified" | "unverified">("all")
  const [selectedAttendee, setSelectedAttendee] = useState<AttendeeData | null>(null)
  const [registryDialogOpen, setRegistryDialogOpen] = useState(false)

  const filteredAttendees = useMemo(() => {
    return attendees.filter((attendee) => {
      const matchesSearch =
        attendee.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        attendee.fullName.toLowerCase().includes(searchTerm.toLowerCase())

      const matchesFilter =
        verificationFilter === "all" ||
        (verificationFilter === "verified" && attendee.verified) ||
        (verificationFilter === "unverified" && !attendee.verified)

      return matchesSearch && matchesFilter
    })
  }, [attendees, searchTerm, verificationFilter])

  const handleRowClick = (attendee: AttendeeData) => {
    setSelectedAttendee(selectedAttendee?.id === attendee.id ? null : attendee)
  }

  const handleExport = (format: "json" | "csv") => {
    // Always export all attendees, mapped to the 4 required fields
    const exportData = attendees.map((a) => ({
      fullName: a.fullName,
      email: a.email,
      ticketId: a.id,
      ticketType: a.ticketType,
    }))

    const fileName = `spotix_${eventId}`

    if (format === "json") {
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" })
      triggerDownload(blob, `${fileName}.json`)
    } else {
      const headers = ["fullName", "email", "ticketId", "ticketType"]
      const rows = exportData.map((row) =>
        headers.map((h) => `"${String(row[h as keyof typeof row]).replace(/"/g, '""')}"`).join(",")
      )
      const csv = [headers.join(","), ...rows].join("\n")
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
      triggerDownload(blob, `${fileName}.csv`)
    }
  }

  const triggerDownload = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Search, Filter and Download Controls */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input
            type="text"
            placeholder="Search by email or name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white border-2 border-slate-200 rounded-xl focus:outline-none focus:border-[#6b2fa5] focus:ring-4 focus:ring-[#6b2fa5]/10 transition-all duration-200 placeholder:text-slate-400"
          />
        </div>
        <div className="relative md:w-64">
          <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <select
            value={verificationFilter}
            onChange={(e) => setVerificationFilter(e.target.value as any)}
            className="w-full pl-12 pr-4 py-3 bg-white border-2 border-slate-200 rounded-xl focus:outline-none focus:border-[#6b2fa5] focus:ring-4 focus:ring-[#6b2fa5]/10 transition-all duration-200 appearance-none cursor-pointer"
          >
            <option value="all">All Attendees</option>
            <option value="verified">Verified Only</option>
            <option value="unverified">Unverified Only</option>
          </select>
          <ChevronUp className="absolute right-4 top-1/2 -translate-y-1/2 rotate-180 text-slate-400 pointer-events-none" size={20} />
        </div>
        <button
          onClick={() => setRegistryDialogOpen(true)}
          disabled={attendees.length === 0}
          className="flex items-center justify-center gap-2 px-5 py-3 bg-[#6b2fa5] text-white font-semibold text-sm rounded-xl shadow-lg shadow-[#6b2fa5]/25 hover:bg-[#5a2690] hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 whitespace-nowrap"
        >
          <Download size={18} />
          Download
        </button>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-[#6b2fa5] to-[#8b4fc5] rounded-xl p-5 text-white shadow-lg shadow-[#6b2fa5]/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-purple-100">Total Attendees</p>
              <p className="text-3xl font-bold mt-1">{attendees.length}</p>
            </div>
            <User size={32} className="text-purple-200" />
          </div>
        </div>
        
        <div className="bg-white rounded-xl p-5 border-2 border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600">Verified</p>
              <p className="text-3xl font-bold text-green-600 mt-1">
                {attendees.filter(a => a.verified).length}
              </p>
            </div>
            <Shield size={32} className="text-green-500" />
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border-2 border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600">Unverified</p>
              <p className="text-3xl font-bold text-amber-600 mt-1">
                {attendees.filter(a => !a.verified).length}
              </p>
            </div>
            <Shield size={32} className="text-amber-500" />
          </div>
        </div>
      </div>

      {/* Attendees Table */}
      <div className="bg-white rounded-xl border-2 border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-slate-50 to-slate-100 border-b-2 border-slate-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Reference</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Name</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Email</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Ticket Type</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Purchase Date</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredAttendees.length > 0 ? (
                filteredAttendees.map((attendee, index) => (
                  <tr
                    key={attendee.id}
                    onClick={() => handleRowClick(attendee)}
                    className={`cursor-pointer transition-all duration-200 ${
                      selectedAttendee?.id === attendee.id 
                        ? "bg-[#6b2fa5]/5 border-l-4 border-l-[#6b2fa5]" 
                        : "hover:bg-slate-50 border-l-4 border-l-transparent"
                    }`}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <td className="px-6 py-4">
                      <span className="text-sm font-semibold text-slate-900">{attendee.ticketReference}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#6b2fa5] to-[#8b4fc5] flex items-center justify-center text-white font-semibold text-sm shadow-md">
                          {attendee.fullName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-slate-900">{attendee.fullName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-slate-600">{attendee.email}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-3 py-1.5 bg-gradient-to-r from-[#6b2fa5]/10 to-[#8b4fc5]/10 text-[#6b2fa5] rounded-lg text-xs font-semibold border border-[#6b2fa5]/20">
                        {attendee.ticketType}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-slate-600 font-medium">
                        {formatFirestoreTimestamp(attendee.purchaseDate)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold ${
                          attendee.verified 
                            ? "bg-green-50 text-green-700 border border-green-200" 
                            : "bg-amber-50 text-amber-700 border border-amber-200"
                        }`}
                      >
                        {attendee.verified ? "✓ Verified" : "⏳ Pending"}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
                        <User size={32} className="text-slate-400" />
                      </div>
                      <p className="text-slate-600 font-medium">
                        {searchTerm || verificationFilter !== "all" ? "No attendees match your search" : "No attendees yet"}
                      </p>
                      {(searchTerm || verificationFilter !== "all") && (
                        <button
                          onClick={() => {
                            setSearchTerm("")
                            setVerificationFilter("all")
                          }}
                          className="text-sm text-[#6b2fa5] font-semibold hover:underline"
                        >
                          Clear filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Attendee Details */}
      {selectedAttendee && (
        <div className="bg-white rounded-xl border-2 border-[#6b2fa5]/20 shadow-xl shadow-[#6b2fa5]/10 p-6 animate-in slide-in-from-bottom duration-300">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#6b2fa5] to-[#8b4fc5] flex items-center justify-center text-white font-bold text-lg shadow-lg">
                {selectedAttendee.fullName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h4 className="text-xl font-bold text-slate-900">{selectedAttendee.fullName}</h4>
                <p className="text-sm text-slate-500">Attendee Details</p>
              </div>
            </div>
            <button
              onClick={() => setSelectedAttendee(null)}
              className="p-2.5 hover:bg-slate-100 rounded-xl transition-all duration-200 hover:scale-110 active:scale-95"
            >
              <ChevronUp size={20} className="text-slate-600" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="group flex items-center gap-4 p-5 bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl hover:shadow-md transition-all duration-200 border-2 border-slate-200">
              <div className="p-3 bg-white rounded-lg shadow-sm group-hover:scale-110 transition-transform duration-200">
                <Mail size={24} className="text-[#6b2fa5]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Email</p>
                <p className="text-sm font-semibold text-slate-900 truncate">{selectedAttendee.email}</p>
              </div>
            </div>

            <div className="group flex items-center gap-4 p-5 bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl hover:shadow-md transition-all duration-200 border-2 border-slate-200">
              <div className="p-3 bg-white rounded-lg shadow-sm group-hover:scale-110 transition-transform duration-200">
                <ShoppingCart size={24} className="text-[#6b2fa5]" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Ticket Type</p>
                <p className="text-sm font-semibold text-slate-900">{selectedAttendee.ticketType}</p>
              </div>
            </div>

            <div className="group flex items-center gap-4 p-5 bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl hover:shadow-md transition-all duration-200 border-2 border-slate-200">
              <div className="p-3 bg-white rounded-lg shadow-sm group-hover:scale-110 transition-transform duration-200">
                <Shield size={24} className={selectedAttendee.verified ? "text-green-600" : "text-amber-600"} />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</p>
                <p
                  className={`text-sm font-bold ${
                    selectedAttendee.verified ? "text-green-600" : "text-amber-600"
                  }`}
                >
                  {selectedAttendee.verified ? "✓ Verified" : "⏳ Pending"}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 p-4 bg-[#6b2fa5]/5 rounded-xl border border-[#6b2fa5]/20">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600 font-medium">Ticket Reference:</span>
              <span className="font-bold text-[#6b2fa5]">{selectedAttendee.ticketReference}</span>
            </div>
          </div>
        </div>
      )}

      {/* Registry Export Dialog */}
      <RegistryDialog
        open={registryDialogOpen}
        onClose={() => setRegistryDialogOpen(false)}
        onExport={handleExport}
        attendeeCount={attendees.length}
      />
    </div>
  )
}