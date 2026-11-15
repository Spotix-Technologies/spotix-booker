"use client"

import { useState, useEffect } from "react"
import { useRouter } from 'next/navigation'
import { auth, db } from "@/lib/firebase"
import { onAuthStateChanged } from "firebase/auth"
import { collection, getDocs, getDoc, doc, updateDoc } from "firebase/firestore"
import { Nav } from "@/components/nav"
import ScannerSelectionDialog from "@/components/verify-ticket/scanner-selection-dialog"
import EventSelector from "@/components/verify-ticket/event-selector"
import TicketForm from "@/components/verify-ticket/ticket-form"
import { ResponsiveSheet } from "@/components/ui/responsive-sheet"
import QrScanner from "@/components/verify-ticket/qr-scanner"
import VerificationResult from "@/components/verify-ticket/verification-result"
import { Preloader } from "@/components/preloader"

interface EventOption {
  id: string
  name: string
}

interface TicketData {
  id: string
  eventId: string
  eventName: string
  attendeeName: string
  attendeeEmail: string
  ticketType: string
  purchaseDate: string
  purchaseTime: string
  isVerified: boolean
  ticketReference: string
}

export default function VerifyTicketPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [ticketId, setTicketId] = useState("")
  const [ticketData, setTicketData] = useState<TicketData | null>(null)
  const [verificationStatus, setVerificationStatus] = useState<
    "idle" | "success" | "error" | "already-verified" | "not-found"
  >("idle")
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [bookerEvents, setBookerEvents] = useState<EventOption[]>([])
  const [errorMessage, setErrorMessage] = useState<string>("")
  const [isScanning, setIsScanning] = useState(false)
  const [scannerLibrary, setScannerLibrary] = useState<"html5qrcode" | "zxing">("html5qrcode")
  const [showScannerDialog, setShowScannerDialog] = useState(true)
  const [user, setUser] = useState<any>(null)

  // Check authentication and fetch events
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.push("/login")
        return
      }

      setUser(currentUser)
      await fetchBookerEvents(currentUser.uid)
      setInitialLoading(false)
    })

    return () => unsubscribe()
  }, [router])

  const fetchBookerEvents = async (userId: string) => {
    try {
      const eventsCollectionRef = collection(db, "events", userId, "userEvents")
      const eventsSnapshot = await getDocs(eventsCollectionRef)

      const events: EventOption[] = []
      eventsSnapshot.forEach((docSnapshot) => {
        const data = docSnapshot.data()
        events.push({
          id: docSnapshot.id,
          name: data.eventName || "Unnamed Event",
        })
      })

      setBookerEvents(events)
    } catch (error) {
      console.error("Error fetching booker events:", error)
      setErrorMessage("Failed to fetch your events. Please refresh the page.")
    }
  }

  const verifyTicket = async (scannedTicketId: string) => {
    if (!scannedTicketId || !selectedEventId || !user) return

    setLoading(true)
    setVerificationStatus("idle")
    setErrorMessage("")

    try {
      const attendeeDocRef = doc(db, "events", user.uid, "userEvents", selectedEventId, "attendees", scannedTicketId)
      const attendeeDoc = await getDoc(attendeeDocRef)

      if (!attendeeDoc.exists()) {
        setVerificationStatus("not-found")
        setErrorMessage("This ticket ID is not associated with this event.")
        setLoading(false)
        return
      }

      const attendeeData = attendeeDoc.data()
      const attendeeUid = attendeeData.uid

      if (!attendeeUid) {
        setVerificationStatus("error")
        setErrorMessage("Invalid ticket data: User ID not found.")
        setLoading(false)
        return
      }

      if (attendeeData.verified) {
        setTicketData({
          id: scannedTicketId,
          eventId: selectedEventId,
          eventName: bookerEvents.find((event) => event.id === selectedEventId)?.name || "Unknown Event",
          attendeeName: attendeeData.fullName || "Unknown",
          attendeeEmail: attendeeData.email || "unknown@example.com",
          ticketType: attendeeData.ticketType || "Standard",
          purchaseDate: attendeeData.purchaseDate || "Unknown",
          purchaseTime: attendeeData.purchaseTime || "Unknown",
          isVerified: true,
          ticketReference: attendeeData.ticketReference || "",
        })
        setVerificationStatus("already-verified")
        setLoading(false)
        return
      }

      const ticketHistoryDocRef = doc(db, "TicketHistory", attendeeUid, "tickets", scannedTicketId)
      const ticketHistoryDoc = await getDoc(ticketHistoryDocRef)

      if (!ticketHistoryDoc.exists()) {
        setVerificationStatus("error")
        setErrorMessage("Ticket not found in user's history. Data inconsistency detected.")
        setLoading(false)
        return
      }

      const currentTime = new Date()
      const verificationData = {
        verified: true,
        verificationDate: currentTime.toLocaleDateString(),
        verificationTime: currentTime.toLocaleTimeString(),
        verifiedBy: user.uid,
      }

      await updateDoc(attendeeDocRef, verificationData)
      await updateDoc(ticketHistoryDocRef, verificationData)

      setTicketData({
        id: scannedTicketId,
        eventId: selectedEventId,
        eventName: bookerEvents.find((event) => event.id === selectedEventId)?.name || "Unknown Event",
        attendeeName: attendeeData.fullName || "Unknown",
        attendeeEmail: attendeeData.email || "unknown@example.com",
        ticketType: attendeeData.ticketType || "Standard",
        purchaseDate: attendeeData.purchaseDate || "Unknown",
        purchaseTime: attendeeData.purchaseTime || "Unknown",
        isVerified: false,
        ticketReference: attendeeData.ticketReference || "",
      })
      setVerificationStatus("success")
    } catch (error) {
      console.error("Error verifying ticket:", error)
      setVerificationStatus("error")
      setErrorMessage("An error occurred while verifying the ticket. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleTicketIdChange = (value: string) => {
    setTicketId(value)
    setVerificationStatus("idle")
    setTicketData(null)
    setErrorMessage("")
  }

  const handleEventChange = (value: string) => {
    setSelectedEventId(value)
    setVerificationStatus("idle")
    setTicketData(null)
    setErrorMessage("")
  }

  const handleVerifyTicket = () => {
    verifyTicket(ticketId)
  }

  const handleScanAgain = () => {
    setTicketId("")
    setTicketData(null)
    setVerificationStatus("idle")
    setErrorMessage("")
  }

  const handleScannerSelection = (library: "html5qrcode" | "zxing") => {
    setScannerLibrary(library)
    setShowScannerDialog(false)
  }

  if (initialLoading) {
    return <Preloader isLoading={false} />
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-purple-50/30 to-gray-100">
      <Nav />

      {showScannerDialog && (
        <ScannerSelectionDialog onSelectLibrary={handleScannerSelection} />
      )}

      <main className="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <div className="space-y-8">
          {/* Page Header */}
          <div className="text-center space-y-4 animate-in fade-in slide-in-from-top-4 duration-700">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-[#6b2fa5] to-[#8b3fc5] rounded-2xl shadow-lg shadow-[#6b2fa5]/30 mb-4">
              <svg 
                className="w-10 h-10 text-white" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" 
                />
              </svg>
            </div>
            <h1 className="text-5xl font-bold bg-gradient-to-r from-gray-900 via-[#6b2fa5] to-gray-900 bg-clip-text text-transparent">
              Verify Ticket
            </h1>
            <p className="text-gray-600 text-lg max-w-2xl mx-auto">
              Scan or enter ticket IDs to verify attendee entry and manage event access
            </p>
          </div>

          {/* Current Scanner Info */}
          <div className="bg-gradient-to-r from-[#6b2fa5]/10 via-[#8b3fc5]/10 to-[#6b2fa5]/10 border-2 border-[#6b2fa5]/30 rounded-xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg shadow-[#6b2fa5]/5 animate-in fade-in slide-in-from-top-6 duration-700">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-10 h-10 bg-[#6b2fa5] rounded-lg flex items-center justify-center shadow-md">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-gray-600 font-medium">Current Scanner</p>
                <p className="font-bold text-[#6b2fa5] text-lg">
                  Spotix-{scannerLibrary === "html5qrcode" ? "Pixel View" : "Tyrex"}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowScannerDialog(true)}
              className="px-5 py-2.5 text-sm font-semibold text-[#6b2fa5] hover:text-white bg-white hover:bg-[#6b2fa5] border-2 border-[#6b2fa5] rounded-lg transition-all duration-200 shadow-md hover:shadow-lg hover:scale-105 active:scale-95"
            >
              Change Scanner
            </button>
          </div>

          {/* Main Content */}
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            {verificationStatus === "idle" ? (
              <div className="space-y-6">
                <EventSelector
                  bookerEvents={bookerEvents}
                  selectedEventId={selectedEventId}
                  onChange={handleEventChange}
                />

                <TicketForm
                  ticketId={ticketId}
                  onTicketIdChange={handleTicketIdChange}
                  onVerify={handleVerifyTicket}
                  onScan={() => setIsScanning(true)}
                  loading={loading}
                  selectedEventId={selectedEventId}
                  errorMessage={errorMessage}
                />

                {isScanning && (
                  <QrScanner
                    scannerLibrary={scannerLibrary}
                    onClose={() => setIsScanning(false)}
                    onDetected={(scannedText) => {
                      setTicketId(scannedText)
                      setIsScanning(false)
                      verifyTicket(scannedText)
                    }}
                  />
                )}
              </div>
            ) : (
              <VerificationResult
                status={verificationStatus}
                ticketData={ticketData}
                errorMessage={errorMessage}
                onScanAgain={handleScanAgain}
              />
            )}
          </div>

          <ResponsiveSheet
            open={loading}
            onClose={() => {}}
            dismissible={false}
            size="sm"
            hideHeader
            ariaLabel="Verifying ticket"
            zIndex={80}
          >
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="w-16 h-16 border-4 border-[#6b2fa5]/30 border-t-[#6b2fa5] rounded-full animate-spin"></div>
              <p className="text-gray-900 font-semibold text-lg">Verifying ticket...</p>
            </div>
          </ResponsiveSheet>
        </div>
      </main>
    </div>
  )
}