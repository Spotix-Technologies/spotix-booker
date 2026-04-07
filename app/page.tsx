"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    // Redirect to dashboard immediately (middleware protects unauthorized access)
    router.push("/dashboard")
  }, [router])

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 via-purple-50/30 to-gray-100 font-sans overflow-hidden">
      {/* Animated background particles */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#6b2fa5]/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-300/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      <main className="relative flex flex-col items-center justify-center gap-12 p-8 animate-in fade-in zoom-in-95 duration-1000">
        {/* Logo with animated rings */}
        <div className="relative">
          {/* Outer pulsing ring */}
          <div className="absolute inset-0 -m-8 rounded-full bg-gradient-to-r from-[#6b2fa5] to-[#8b3fc5] opacity-20 animate-ping"></div>
          
          {/* Middle rotating ring */}
          <div className="absolute inset-0 -m-6 rounded-full border-4 border-[#6b2fa5]/30 animate-spin-slow"></div>
          
          {/* Inner rotating ring (opposite direction) */}
          <div className="absolute inset-0 -m-4 rounded-full border-4 border-[#8b3fc5]/40 animate-spin-reverse"></div>
          
          {/* Logo container */}
          <div className="relative w-40 h-40 bg-white rounded-full shadow-2xl shadow-[#6b2fa5]/30 flex items-center justify-center p-8 animate-float">
            <Image
              src="/logo1.png"
              alt="Spotix Logo"
              width={120}
              height={120}
              priority
              className="w-full h-full object-contain"
            />
          </div>
        </div>

        {/* Welcome text */}
        <div className="text-center space-y-4 animate-in slide-in-from-bottom-4 duration-1000 delay-300">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-[#6b2fa5] via-[#8b3fc5] to-[#6b2fa5] bg-clip-text text-transparent animate-gradient bg-[length:200%_auto]">
            Welcome to Spotix
          </h1>
          <p className="text-2xl md:text-3xl font-semibold text-gray-800">
            Booker Portal
          </p>
        </div>

        {/* Redirecting message with loading animation */}
        <div className="flex flex-col items-center gap-4 animate-in slide-in-from-bottom-6 duration-1000 delay-500">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-[#6b2fa5] rounded-full animate-bounce"></div>
            <div className="w-2 h-2 bg-[#6b2fa5] rounded-full animate-bounce delay-150"></div>
            <div className="w-2 h-2 bg-[#6b2fa5] rounded-full animate-bounce delay-300"></div>
          </div>
          <p className="text-lg text-gray-600 font-medium">
            Redirecting to your dashboard...
          </p>
        </div>

        {/* Progress bar */}
        <div className="w-64 h-1.5 bg-gray-200 rounded-full overflow-hidden animate-in fade-in duration-1000 delay-700">
          <div className="h-full bg-gradient-to-r from-[#6b2fa5] to-[#8b3fc5] rounded-full animate-progress shadow-lg shadow-[#6b2fa5]/50"></div>
        </div>
      </main>

      <style jsx>{`
        @keyframes spin-slow {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes spin-reverse {
          from {
            transform: rotate(360deg);
          }
          to {
            transform: rotate(0deg);
          }
        }

        @keyframes float {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-10px);
          }
        }

        @keyframes gradient {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }

        @keyframes progress {
          from {
            width: 0%;
          }
          to {
            width: 100%;
          }
        }

        .animate-spin-slow {
          animation: spin-slow 3s linear infinite;
        }

        .animate-spin-reverse {
          animation: spin-reverse 4s linear infinite;
        }

        .animate-float {
          animation: float 3s ease-in-out infinite;
        }

        .animate-gradient {
          animation: gradient 3s ease infinite;
        }

        .animate-progress {
          animation: progress 3s ease-in-out;
        }

        .delay-150 {
          animation-delay: 150ms;
        }

        .delay-300 {
          animation-delay: 300ms;
        }

        .delay-1000 {
          animation-delay: 1000ms;
        }
      `}</style>
    </div>
  )
}
