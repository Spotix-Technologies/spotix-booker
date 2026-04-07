"use client"

import { useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Image from "next/image"
import { ParticlesBackground } from "@/components/particles-background"
// import { Nav } from "@/components/nav"
import { CheckCircle, Sparkles, Calendar, Eye } from "lucide-react"
import confetti from "canvas-confetti"

export default function SuccessPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const eventId = searchParams.get("eventId")
  const payId = searchParams.get("payId")
  const type = searchParams.get("type")
  const eventName = searchParams.get("eventName")

  useEffect(() => {
    // Initial confetti burst
    const fireConfetti = () => {
      const duration = 3 * 1000
      const animationEnd = Date.now() + duration
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 }

      function randomInRange(min: number, max: number) {
        return Math.random() * (max - min) + min
      }

      const interval: any = setInterval(function() {
        const timeLeft = animationEnd - Date.now()

        if (timeLeft <= 0) {
          return clearInterval(interval)
        }

        const particleCount = 50 * (timeLeft / duration)
        
        confetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
          colors: ['#6b2fa5', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe']
        })
        confetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
          colors: ['#6b2fa5', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe']
        })
      }, 250)
    }

    // Fire initial confetti
    fireConfetti()

    // Set up interval for confetti every 5 seconds
    const confettiInterval = setInterval(() => {
      fireConfetti()
    }, 5000)

    return () => {
      clearInterval(confettiInterval)
    }
  }, [])

  const handleGoHome = () => {
    router.push("/dashboard")
  }

  return (
    <>
      <ParticlesBackground />
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-purple-50">
        {/* <Nav /> */}

        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <div className="text-center space-y-8">
            {/* Success Icon and Image */}
            <div className="flex flex-col items-center gap-6">
              <div className="relative w-48 h-48 sm:w-64 sm:h-64 animate-bounce-slow">
                <Image 
                  src="/all-done.svg" 
                  alt="Success" 
                  fill 
                  className="object-contain drop-shadow-2xl" 
                  priority
                />
              </div>

              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-green-400 to-green-600 shadow-lg animate-scale-in">
                <CheckCircle size={40} className="text-white" strokeWidth={2.5} />
              </div>
            </div>

            {/* Success Message */}
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center justify-center gap-2">
                <Sparkles size={24} className="text-yellow-500 animate-pulse" />
                <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-purple-600 to-purple-900 bg-clip-text text-transparent">
                  Congratulations!
                </h1>
                <Sparkles size={24} className="text-yellow-500 animate-pulse" />
              </div>

              <p className="text-lg sm:text-xl text-gray-700 max-w-2xl mx-auto leading-relaxed">
                {type === "event-group"
                  ? "🎉 You have successfully created an event group. Your event series is now ready to add individual events."
                  : "🎊 You have successfully created an event. Your event details are now live and ready for attendees to purchase tickets."}
              </p>
            </div>

            {/* Event Details Cards */}
            {type !== "event-group" && (
              <div className="grid sm:grid-cols-2 gap-4 max-w-2xl mx-auto animate-slide-up">
                <div className="rounded-xl border-2 border-purple-200 bg-white p-6 shadow-lg hover:shadow-xl transition-all hover:scale-105">
                  <div className="flex items-center justify-center mb-3">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <Calendar size={24} style={{ color: '#6b2fa5' }} />
                    </div>
                  </div>
                  <p className="text-sm font-medium text-gray-600 mb-2">Event ID</p>
                  <p className="text-xl font-bold text-purple-700 break-all">{eventId}</p>
                </div>
                
                <div className="rounded-xl border-2 border-purple-200 bg-white p-6 shadow-lg hover:shadow-xl transition-all hover:scale-105">
                  <div className="flex items-center justify-center mb-3">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <CheckCircle size={24} style={{ color: '#6b2fa5' }} />
                    </div>
                  </div>
                  <p className="text-sm font-medium text-gray-600 mb-2">Payment ID</p>
                  <p className="text-xl font-bold text-purple-700 break-all">{payId}</p>
                </div>
              </div>
            )}

            {type === "event-group" && (
              <div className="rounded-xl border-2 border-purple-200 bg-white p-6 max-w-2xl mx-auto shadow-lg hover:shadow-xl transition-all hover:scale-105 animate-slide-up">
                <div className="flex items-center justify-center mb-3">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <Calendar size={24} style={{ color: '#6b2fa5' }} />
                  </div>
                </div>
                <p className="text-sm font-medium text-gray-600 mb-2">Event Group Name</p>
                <p className="text-2xl font-bold text-purple-700 break-all">{eventName}</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-6 animate-slide-up">
              <button
                onClick={handleGoHome}
                className="group px-8 py-4 bg-gradient-to-r from-purple-600 to-purple-700 text-white font-semibold rounded-xl hover:from-purple-700 hover:to-purple-800 transition-all transform hover:scale-105 shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                style={{ backgroundColor: '#6b2fa5' }}
              >
                <span>Go to Dashboard</span>
                <span className="group-hover:translate-x-1 transition-transform">→</span>
              </button>

              <button
                onClick={() => router.push("/events")}
                className="group px-8 py-4 border-2 border-purple-600 text-purple-700 font-semibold rounded-xl hover:bg-purple-600 hover:text-white transition-all transform hover:scale-105 shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
              >
                <Eye size={20} />
                <span>View My Events</span>
              </button>
            </div>

            {/* Additional Info */}
            <div className="pt-8">
              <p className="text-sm text-gray-500 italic">
                You can manage your event from the dashboard at any time
              </p>
            </div>
          </div>
        </main>
      </div>

      <style jsx>{`
        @keyframes bounce-slow {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-20px);
          }
        }
        
        @keyframes scale-in {
          0% {
            transform: scale(0);
            opacity: 0;
          }
          50% {
            transform: scale(1.1);
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
        
        @keyframes fade-in {
          0% {
            opacity: 0;
            transform: translateY(20px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes slide-up {
          0% {
            opacity: 0;
            transform: translateY(40px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .animate-bounce-slow {
          animation: bounce-slow 3s ease-in-out infinite;
        }
        
        .animate-scale-in {
          animation: scale-in 0.5s ease-out;
        }
        
        .animate-fade-in {
          animation: fade-in 0.8s ease-out 0.3s both;
        }
        
        .animate-slide-up {
          animation: slide-up 0.8s ease-out 0.6s both;
        }
      `}</style>
    </>
  )
}