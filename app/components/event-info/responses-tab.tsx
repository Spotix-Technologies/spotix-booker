"use client"

import { useState, useEffect } from "react"
import { FileText, Loader2, Calendar, User, Mail, Ticket, Download, Filter, Search } from "lucide-react"
import { SkeletonTable } from "@/components/ui/skeleton"
import ResponsiveSheet from "@/components/ui/responsive-sheet"

interface Response {
  id: string
  responses: Record<string, any>
  attendeeInfo: {
    fullName?: string
    email?: string
    ticketType?: string
  }
  submittedAt: string
}

interface Question {
  id: string
  questionText: string
  questionType: string
  options?: string[]
}

interface ResponsesTabProps {
  userId: string
  eventId: string
}

export default function ResponsesTab({ userId, eventId }: ResponsesTabProps) {
  const [responses, setResponses] = useState<Response[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedResponse, setSelectedResponse] = useState<Response | null>(null)

  useEffect(() => {
    fetchResponses()
  }, [userId, eventId])

  const fetchResponses = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/survey/response?userId=${userId}&eventId=${eventId}`)
      const data = await response.json()

      if (data.success) {
        setResponses(data.responses || [])
        setQuestions(data.questions || [])
      }
    } catch (error) {
      console.error("Error fetching responses:", error)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString)
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    } catch {
      return dateString
    }
  }

  const getQuestionText = (questionId: string) => {
    const question = questions.find((q) => q.id === questionId)
    return question?.questionText || questionId
  }

  const exportToCSV = () => {
    if (responses.length === 0) return

    // Create CSV headers
    const headers = ["Name", "Email", "Ticket Type", "Submitted At", ...questions.map((q) => q.questionText)]

    // Create CSV rows
    const rows = responses.map((response) => {
      const row = [
        response.attendeeInfo.fullName || "",
        response.attendeeInfo.email || "",
        response.attendeeInfo.ticketType || "",
        formatDate(response.submittedAt),
        ...questions.map((q) => {
          const answer = response.responses[q.id]
          if (Array.isArray(answer)) {
            return answer.join("; ")
          }
          return answer || ""
        }),
      ]
      return row.map((cell) => `"${cell}"`).join(",")
    })

    // Combine headers and rows
    const csv = [headers.map((h) => `"${h}"`).join(","), ...rows].join("\n")

    // Download
    const blob = new Blob([csv], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `event-responses-${new Date().toISOString().split("T")[0]}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const filteredResponses = responses.filter((response) => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      response.attendeeInfo.fullName?.toLowerCase().includes(query) ||
      response.attendeeInfo.email?.toLowerCase().includes(query) ||
      response.attendeeInfo.ticketType?.toLowerCase().includes(query)
    )
  })

  if (loading) {
    return <SkeletonTable rows={6} />
  }

  if (responses.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="flex items-center justify-center w-20 h-20 mx-auto bg-gradient-to-br from-slate-100 to-slate-200 rounded-full mb-6">
          <FileText className="w-10 h-10 text-slate-400" />
        </div>
        <h3 className="text-2xl font-bold text-slate-900 mb-2">No Responses Yet</h3>
        <p className="text-slate-600 max-w-md mx-auto leading-relaxed">
          Once attendees start filling out your form, their responses will appear here. You'll be able to view and
          export all submissions.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Form Responses</h2>
          <p className="text-slate-600 mt-1">
            <span className="font-semibold text-[#6b2fa5]">{responses.length}</span> response
            {responses.length !== 1 ? "s" : ""} collected
          </p>
        </div>

        <button
          onClick={exportToCSV}
          className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg transition-all duration-200 shadow-md hover:shadow-lg"
        >
          <Download className="w-5 h-5" />
          Export CSV
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          type="text"
          placeholder="Search by name, email, or ticket type..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-12 pr-4 py-3 border-2 border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] focus:border-[#6b2fa5] transition-all duration-200"
        />
      </div>

      {/* Responses List */}
      <div className="grid gap-4">
        {filteredResponses.map((response) => (
          <div
            key={response.id}
            className="group bg-white border-2 border-slate-200 rounded-xl p-6 hover:border-[#6b2fa5]/30 hover:shadow-lg transition-all duration-200 cursor-pointer"
            onClick={() => setSelectedResponse(response)}
          >
            {/* Response Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="flex items-center justify-center w-12 h-12 bg-gradient-to-br from-[#6b2fa5] to-purple-600 rounded-xl flex-shrink-0 shadow-md">
                  <User className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-slate-900 truncate">
                    {response.attendeeInfo.fullName || "Anonymous"}
                  </h3>
                  <div className="flex items-center gap-2 text-sm text-slate-600 mt-1">
                    <Mail className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{response.attendeeInfo.email || "No email"}</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-[#6b2fa5]/10 rounded-lg">
                  <Ticket className="w-4 h-4 text-[#6b2fa5]" />
                  <span className="text-sm font-semibold text-[#6b2fa5]">
                    {response.attendeeInfo.ticketType || "N/A"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Calendar className="w-3.5 h-3.5" />
                  {formatDate(response.submittedAt)}
                </div>
              </div>
            </div>

            {/* Quick Preview of Responses */}
            <div className="pt-4 border-t border-slate-200">
              <div className="space-y-2">
                {questions.slice(0, 2).map((question) => {
                  const answer = response.responses[question.id]
                  if (!answer) return null
                  return (
                    <div key={question.id} className="text-sm">
                      <span className="font-semibold text-slate-700">{question.questionText}:</span>{" "}
                      <span className="text-slate-600">
                        {Array.isArray(answer) ? answer.join(", ") : String(answer)}
                      </span>
                    </div>
                  )
                })}
                {questions.length > 2 && (
                  <p className="text-sm text-[#6b2fa5] font-medium">
                    +{questions.length - 2} more response{questions.length - 2 !== 1 ? "s" : ""}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Detailed Response Modal */}
      {selectedResponse && (
        <ResponsiveSheet
          open
          onClose={() => setSelectedResponse(null)}
          size="lg"
          hideHeader
          ariaLabel="Response details"
          bodyClassName="p-0"
        >
          <div className="bg-gradient-to-r from-[#6b2fa5] to-purple-600 px-5 py-5 pr-14">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-12 h-12 bg-white/20 rounded-xl backdrop-blur-sm shrink-0">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xl font-bold text-white truncate">
                  {selectedResponse.attendeeInfo.fullName || "Anonymous Response"}
                </h3>
                <p className="text-purple-100 text-sm">{formatDate(selectedResponse.submittedAt)}</p>
              </div>
            </div>
          </div>

          <div className="p-5 sm:p-6">
          {/* Attendee Info */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 p-4 bg-slate-50 rounded-lg">
            <div>
              <p className="text-xs text-slate-600 mb-1">Email</p>
              <p className="font-semibold text-slate-900 truncate">
                {selectedResponse.attendeeInfo.email || "N/A"}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-600 mb-1">Ticket Type</p>
              <p className="font-semibold text-slate-900">{selectedResponse.attendeeInfo.ticketType || "N/A"}</p>
            </div>
            <div>
              <p className="text-xs text-slate-600 mb-1">Submitted</p>
              <p className="font-semibold text-slate-900">{formatDate(selectedResponse.submittedAt)}</p>
            </div>
          </div>

          {/* Responses */}
          <div className="space-y-6">
            <h4 className="text-lg font-bold text-slate-900">Responses</h4>
            {questions.map((question, index) => {
              const answer = selectedResponse.responses[question.id]
              return (
                <div key={question.id} className="pb-6 border-b border-slate-200 last:border-0">
                  <p className="font-semibold text-slate-900 mb-3">
                    {index + 1}. {question.questionText}
                  </p>
                  <div className="pl-4">
                    {answer ? (
                      Array.isArray(answer) ? (
                        <ul className="space-y-2">
                          {answer.map((item, i) => (
                            <li key={i} className="flex items-center gap-2 text-slate-700">
                              <div className="w-1.5 h-1.5 bg-[#6b2fa5] rounded-full"></div>
                              {item}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-slate-700 bg-slate-50 px-4 py-3 rounded-lg">{String(answer)}</p>
                      )
                    ) : (
                      <p className="text-slate-400 italic">No response</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          </div>
        </ResponsiveSheet>
      )}
    </div>
  )
}