"use client"

import { Upload, Wand2 } from "lucide-react"
import { ResponsiveSheet } from "@/components/ui/responsive-sheet"

interface ImageChoiceDialogProps {
  onUpload: () => void
  onGenerate: () => void
  onClose: () => void
}

export function ImageChoiceDialog({ onUpload, onGenerate, onClose }: ImageChoiceDialogProps) {
  return (
    <ResponsiveSheet
      open
      onClose={onClose}
      title="Add contestant photo"
      description="Upload your image or we will generate one for you."
      size="sm"
      zIndex={70}
    >
      <div className="space-y-2.5">
        <button
          onClick={onUpload}
          className="w-full flex items-center gap-3 p-3.5 rounded-xl border-2 border-slate-200 hover:border-[#6b2fa5] transition-colors text-left"
        >
          <div className="w-9 h-9 rounded-full bg-[#6b2fa5]/10 flex items-center justify-center flex-shrink-0">
            <Upload className="w-4 h-4 text-[#6b2fa5]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Upload your image</p>
            <p className="text-xs text-slate-500">Choose a photo from your device</p>
          </div>
        </button>

        <button
          onClick={onGenerate}
          className="w-full flex items-center gap-3 p-3.5 rounded-xl border-2 border-slate-200 hover:border-[#6b2fa5] transition-colors text-left"
        >
          <div className="w-9 h-9 rounded-full bg-[#6b2fa5]/10 flex items-center justify-center flex-shrink-0">
            <Wand2 className="w-4 h-4 text-[#6b2fa5]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Generate an avatar</p>
            <p className="text-xs text-slate-500">We'll create a unique avatar automatically</p>
          </div>
        </button>
      </div>
    </ResponsiveSheet>
  )
}
