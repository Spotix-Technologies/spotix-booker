"use client"

import { AlertTriangle } from "lucide-react"
import { ResponsiveSheet } from "@/components/ui/responsive-sheet"

interface UnsavedChangesDialogProps {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Shared "leave without saving?" confirmation — pair with
 * hooks/useUnsavedChangesWarning.ts. Used on create-event, poll create/
 * edit, and election create (item 8 of the UI renovation).
 * Escape / backdrop / swipe-down behave like "Keep editing".
 */
export function UnsavedChangesDialog({ open, onConfirm, onCancel }: UnsavedChangesDialogProps) {
  return (
    <ResponsiveSheet
      open={open}
      onClose={onCancel}
      role="alertdialog"
      size="sm"
      zIndex={100}
      title="Leave without saving?"
      description="Your changes haven't been saved yet. If you leave now, they'll be lost."
      icon={
        <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
        </div>
      }
      bodyClassName="p-0"
      footer={
        <div className="flex flex-col-reverse sm:flex-row gap-2.5">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors"
          >
            Keep editing
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors"
          >
            Leave page
          </button>
        </div>
      }
    >
      <></>
    </ResponsiveSheet>
  )
}
