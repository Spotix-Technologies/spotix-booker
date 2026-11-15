"use client"

import ResponsiveSheet from "@/components/ui/responsive-sheet"
import {
  Clock, CheckCircle2, Loader2, XCircle, Ban, Lock, KeyRound, ShieldCheck,
} from "lucide-react"

interface LogEntry {
  type: string
  at: string
  byUid?: string
  byName?: string
  byEmail?: string
  message: string
  meta?: { maskedAccountNumber?: string; bankName?: string }
}

interface PayoutTimelineRecord {
  id: string
  date: string
  amount: number
  bankName: string
  accountNumber: string
  accountName: string
  status: string
  initiatedByName?: string
  initiatedByEmail?: string
  cancelledByName?: string
  logs?: LogEntry[]
}

interface PayoutTimelineModalProps {
  record: PayoutTimelineRecord
  onClose: () => void
}

function maskAccountNumber(accountNumber: string): string {
  const acc = String(accountNumber ?? "")
  if (acc.length <= 4) return acc
  return `${"•".repeat(acc.length - 4)}${acc.slice(-4)}`
}

const LOG_ICON: Record<string, React.ReactNode> = {
  initiated: <Clock size={14} className="text-amber-500" />,
  vault_key_submitted: <KeyRound size={14} className="text-purple-500" />,
  vault_completed: <ShieldCheck size={14} className="text-purple-600" />,
  processing: <Loader2 size={14} className="text-blue-500" />,
  successful: <CheckCircle2 size={14} className="text-green-500" />,
  failed: <XCircle size={14} className="text-red-500" />,
  cancelled: <Ban size={14} className="text-gray-500" />,
  rejected: <XCircle size={14} className="text-red-500" />,
}

export default function PayoutTimelineModal({ record, onClose }: PayoutTimelineModalProps) {
  const logs = [...(record.logs ?? [])].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()
  )

  return (
    <ResponsiveSheet
      open
      onClose={onClose}
      size="lg"
      zIndex={70}
      title="Payout Logs"
      description={`${record.date} · ₦${Number(record.amount).toLocaleString()}`}
    >
      <div className="space-y-4">
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-1">
        <p className="text-xs text-gray-500">
          Initiated by{" "}
          <span className="font-semibold text-gray-800">
            {record.initiatedByName || "Unknown"}
          </span>
          {record.initiatedByEmail ? ` (${record.initiatedByEmail})` : ""}
        </p>
        <p className="text-xs text-gray-500">
          Bank:{" "}
          <span className="font-semibold text-gray-800">{record.bankName}</span>
          {" · "}
          {record.accountName} · {maskAccountNumber(record.accountNumber)}
        </p>
      </div>

      {logs.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">No log entries yet.</p>
      ) : (
        <div className="relative pl-6 space-y-5">
          <div className="absolute left-[7px] top-1 bottom-1 w-px bg-gray-200" />
          {logs.map((log, i) => (
            <div key={i} className="relative">
              <div className="absolute -left-6 top-0.5 w-3.5 h-3.5 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-[#6b2fa5]" />
              </div>
              <div className="flex items-start gap-2">
                <div className="mt-0.5">{LOG_ICON[log.type] ?? <Clock size={14} className="text-gray-400" />}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800">{log.message}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(log.at).toLocaleString()}
                    {log.byName ? ` · ${log.byName}` : ""}
                  </p>
                  {log.meta?.maskedAccountNumber && (
                    <p className="text-xs text-gray-400">
                      {log.meta.bankName} · {log.meta.maskedAccountNumber}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      </div>
    </ResponsiveSheet>
  )
}
