"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { CheckCircle, Plus, Settings, Sparkles, PackageCheck, Rocket, Eye } from "lucide-react"

export default function SuccessPage() {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 overflow-hidden">
      {/* Ambient blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#6b2fa5]/8 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-green-300/15 rounded-full blur-3xl" />
      </div>

      <div className="relative bg-white rounded-3xl shadow-xl border border-slate-200 p-10 max-w-md w-full text-center animate-in zoom-in-95 fade-in duration-500">

        {/* Confetti row */}
        <div className="flex justify-center gap-2 mb-6">
          <div className="w-2.5 h-2.5 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
          <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: "100ms" }} />
          <div className="w-2.5 h-2.5 bg-[#6b2fa5] rounded-full animate-bounce" style={{ animationDelay: "200ms" }} />
          <div className="w-2 h-2 bg-pink-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
          <div className="w-2.5 h-2.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "400ms" }} />
        </div>

        {/* Icon */}
        <div className="relative inline-flex mb-6">
          <div className="absolute inset-0 -m-3 rounded-full bg-green-100 animate-ping opacity-60" />
          <div className="relative w-20 h-20 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center shadow-lg shadow-green-500/40">
            <CheckCircle className="w-11 h-11 text-white" strokeWidth={2.5} />
          </div>
          <Sparkles className="absolute -top-1 -right-1 w-6 h-6 text-yellow-400 animate-pulse" />
        </div>

        {/* Copy */}
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Product Created!</h1>
        <p className="text-slate-500 text-sm mb-8 leading-relaxed">
          Your merchandise listing is live and visible to everyone.
        </p>

        {/* Mini stats */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          <div className="bg-green-50 rounded-xl p-3 border border-green-100 flex flex-col items-center">
            <PackageCheck className="w-5 h-5 text-green-600 mb-1" strokeWidth={2.25} />
            <div className="text-xs text-slate-500 font-medium">Listed</div>
          </div>
          <div className="bg-[#6b2fa5]/5 rounded-xl p-3 border border-[#6b2fa5]/15 flex flex-col items-center">
            <Rocket className="w-5 h-5 text-[#6b2fa5] mb-1" strokeWidth={2.25} />
            <div className="text-xs text-slate-500 font-medium">Live</div>
          </div>
          <div className="bg-blue-50 rounded-xl p-3 border border-blue-100 flex flex-col items-center">
            <Eye className="w-5 h-5 text-blue-600 mb-1" strokeWidth={2.25} />
            <div className="text-xs text-slate-500 font-medium">Visible</div>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2.5">
          <Link
            href="/listings"
            className="group flex items-center justify-center gap-2 w-full px-5 py-3 bg-[#6b2fa5] hover:bg-[#5a2589] text-white rounded-xl font-semibold text-sm transition-all duration-200 shadow-sm hover:shadow-md"
          >
            <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform duration-200" />
            Create Another Product
          </Link>

          <Link
            href="/listings/manage"
            className="group flex items-center justify-center gap-2 w-full px-5 py-3 border border-slate-200 text-slate-700 hover:border-[#6b2fa5] hover:text-[#6b2fa5] rounded-xl font-semibold text-sm transition-all duration-200"
          >
            <Settings className="w-4 h-4 group-hover:rotate-45 transition-transform duration-200" />
            Manage Products
          </Link>

          <button
            onClick={() => router.push("/dashboard")}
            className="w-full px-5 py-2.5 text-sm text-slate-400 hover:text-slate-600 rounded-xl transition-colors font-medium"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  )
}
