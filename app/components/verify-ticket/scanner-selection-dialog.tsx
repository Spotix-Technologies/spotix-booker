"use client"

import { ResponsiveSheet } from "@/components/ui/responsive-sheet"

interface ScannerSelectionDialogProps {
  onSelectLibrary: (library: "html5qrcode" | "zxing") => void
}

export default function ScannerSelectionDialog({ onSelectLibrary }: ScannerSelectionDialogProps) {
  return (
    <ResponsiveSheet
      open
      onClose={() => {}}
      dismissible={false}
      size="sm"
      title="Choose Scanner Library"
      description="Select the QR code scanner that works best for your device"
      icon={
          <div className="flex items-center justify-center w-11 h-11 bg-[#6b2fa5]/10 rounded-xl">
            <svg 
              className="w-5 h-5 text-[#6b2fa5]" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" 
              />
            </svg>
          </div>
      }
      footer={
        <p className="text-xs text-gray-500 text-center leading-relaxed">
          You can change this selection later by clicking "Change Scanner"
        </p>
      }
    >
        <div className="space-y-4">
          <button
            onClick={() => onSelectLibrary("html5qrcode")}
            className="w-full p-5 border-2 border-gray-200 hover:border-[#6b2fa5] rounded-xl transition-all duration-200 text-left space-y-2 group hover:shadow-lg hover:shadow-[#6b2fa5]/10 hover:-translate-y-0.5"
          >
            <div className="flex items-start justify-between">
              <div className="space-y-2 flex-1">
                <h4 className="font-bold text-lg text-gray-900 group-hover:text-[#6b2fa5] transition-colors">
                  Pixel View
                </h4>
                <p className="text-sm text-gray-600">
                  Best for Android devices
                </p>
              </div>
              <div className="ml-3">
                <svg 
                  className="w-6 h-6 text-gray-400 group-hover:text-[#6b2fa5] transition-colors" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M9 5l7 7-7 7" 
                  />
                </svg>
              </div>
            </div>
            <span className="inline-flex items-center text-xs font-semibold text-[#6b2fa5] bg-[#6b2fa5]/10 px-3 py-1.5 rounded-full">
              <svg className="w-3 h-3 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Recommended for Android
            </span>
          </button>

          <button
            onClick={() => onSelectLibrary("zxing")}
            className="w-full p-5 border-2 border-gray-200 hover:border-[#6b2fa5] rounded-xl transition-all duration-200 text-left space-y-2 group hover:shadow-lg hover:shadow-[#6b2fa5]/10 hover:-translate-y-0.5"
          >
            <div className="flex items-start justify-between">
              <div className="space-y-2 flex-1">
                <h4 className="font-bold text-lg text-gray-900 group-hover:text-[#6b2fa5] transition-colors">
                  Tyrex
                </h4>
                <p className="text-sm text-gray-600">
                  Best for iOS devices
                </p>
              </div>
              <div className="ml-3">
                <svg 
                  className="w-6 h-6 text-gray-400 group-hover:text-[#6b2fa5] transition-colors" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M9 5l7 7-7 7" 
                  />
                </svg>
              </div>
            </div>
            <span className="inline-flex items-center text-xs font-semibold text-[#6b2fa5] bg-[#6b2fa5]/10 px-3 py-1.5 rounded-full">
              <svg className="w-3 h-3 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Recommended for iPhone/iPad
            </span>
          </button>
        </div>
    </ResponsiveSheet>
  )
}
