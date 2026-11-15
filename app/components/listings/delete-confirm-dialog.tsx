"use client"

import { Button } from "@/components/ui/button"
import { AlertTriangle, Trash2 } from "lucide-react"
import { ResponsiveSheet } from "@/components/ui/responsive-sheet"

interface DeleteConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  isDeleting: boolean
}

export function DeleteConfirmDialog({ open, onOpenChange, onConfirm, isDeleting }: DeleteConfirmDialogProps) {
  return (
    <ResponsiveSheet
      open={open}
      onClose={() => onOpenChange(false)}
      role="alertdialog"
      size="sm"
      title="Delete Product?"
      description="This action cannot be undone. Deleting this product is permanent and will remove all associated data."
      icon={
        <div className="w-11 h-11 bg-red-100 rounded-xl flex items-center justify-center">
          <AlertTriangle className="w-5 h-5 text-red-600" strokeWidth={2.5} />
        </div>
      }
      dismissible={!isDeleting}
      footer={
        <div className="flex flex-col-reverse sm:flex-row gap-3">
          <Button 
            onClick={onConfirm} 
            disabled={isDeleting} 
            className="flex-1 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold py-3 rounded-xl transition-all duration-200 shadow-lg shadow-red-600/30 hover:shadow-xl hover:shadow-red-600/40 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 flex items-center justify-center gap-2"
          >
            {isDeleting ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Deleting...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-5 h-5" />
                <span>Delete Product</span>
              </>
            )}
          </Button>
          <Button 
            onClick={() => onOpenChange(false)} 
            disabled={isDeleting}
  className={
    "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg transition-all " +
    "border border-[#6b2fa5] text-[#6b2fa5] bg-transparent hover:bg-[#6b2fa5]/10"
  }
          >
            Cancel
          </Button>
        </div>
      }
    >
        {/* Warning Banner */}
        <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 flex items-start gap-3">
          <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <div>
            <p className="text-sm text-red-700 font-semibold">Warning</p>
            <p className="text-xs text-red-600 mt-1">This operation is irreversible</p>
          </div>
        </div>
    </ResponsiveSheet>
  )
}
