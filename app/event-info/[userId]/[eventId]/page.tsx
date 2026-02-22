"use client"

import { useMemo } from "react"

import type React from "react"
import { use, useState, useEffect } from "react"
import Link from "next/link"
import { auth, db } from "@/lib/firebase"
import { doc, getDoc, collection, getDocs, updateDoc, addDoc, query, orderBy } from "firebase/firestore"
import { onAuthStateChanged } from "firebase/auth"
import { ArrowLeft } from "lucide-react"
import { Nav } from "@/components/nav"
import OverviewTab from "@/components/event-info/overview-tab"
import AttendeesTab from "@/components/event-info/attendees-tab"
import DiscountsTab from "@/components/event-info/discounts-tab"
import PayoutsTab from "@/components/event-info/payouts-tab"
import EditEventTab from "@/components/event-info/edit-event-tab"
import MerchTab from "@/components/event-info/merch-tab"
import ReferralsTab from "@/components/event-info/referrals-tab"
import EventLinkTab from "@/components/event-info/event-link-tab"
import FormTab from "@/components/event-info/form-tab"
import ResponsesTab from "@/components/event-info/responses-tab"

interface EventData {
  id: string
  eventName: string
  eventImage: string
  eventDate: string
  eventType: string
  eventDescription: string
  isFree: boolean
  ticketPrices: { policy: string; price: number }[]
  createdBy: string
  eventVenue: string
  totalCapacity: number
  ticketsSold: number
  totalRevenue: number
  eventEndDate: string
  eventStart: string
  eventEnd: string
  enableMaxSize: boolean
  maxSize: string
  enableColorCode: boolean
  colorCode: string
  enableStopDate: boolean
  stopDate: string
  payId?: string
  availableRevenue?: number
  totalPaidOut?: number
}

interface AttendeeData {
  id: string
  fullName: string
  email: string
  ticketType: string
  verified: boolean
  purchaseDate: string
  purchaseTime: string
  ticketReference: string
}

interface PayoutData {
  id?: string
  date: string
  amount: number
  status: string
  actionCode?: string
  reference?: string
  createdAt?: any
  payoutAmount?: number
  payableAmount?: number
  agentName?: string
  transactionTime?: string
}

interface DiscountData {
  code: string
  type: "percentage" | "flat"
  value: number
  maxUses: number
  usedCount: number
  active: boolean
}

const formatFirestoreTimestamp = (timestamp: any): string => {
  if (!timestamp) return "Unknown"

  if (timestamp && typeof timestamp === "object" && "seconds" in timestamp) {
    try {
      const date = new Date(timestamp.seconds * 1000)
      return date.toLocaleDateString()
    } catch (error) {
      console.error("Error formatting timestamp:", error)
      return "Invalid date"
    }
  }

  return String(timestamp)
}

const formatTransactionTime = (timestamp: any): string => {
  if (!timestamp) return ""

  if (timestamp && typeof timestamp === "object" && "seconds" in timestamp) {
    try {
      const date = new Date(timestamp.seconds * 1000)
      return date.toLocaleTimeString()
    } catch (error) {
      return ""
    }
  }

  return ""
}

function TabSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-32 bg-slate-200 rounded-lg" />
      <div className="h-24 bg-slate-200 rounded-lg" />
      <div className="grid grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-20 bg-slate-200 rounded-lg" />
        ))}
      </div>
    </div>
  )
}

export default function EventInfoPage({
  params,
}: {
  params: Promise<{ userId: string; eventId: string }>
}) {
  const { userId, eventId } = use(params)

  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [eventData, setEventData] = useState<EventData | null>(null)
  const [attendees, setAttendees] = useState<AttendeeData[]>([])
  const [payouts, setPayouts] = useState<PayoutData[]>([])
  const [activeTab, setActiveTab] = useState<
    "overview" | "eventlink" | "attendees" | "payouts" | "edit" | "discounts" | "merch" | "referrals" | "form" | "responses"
  >("overview")
  const [loadedTabs, setLoadedTabs] = useState<Set<string>>(new Set(["overview"]))
  const [ticketSalesByDay, setTicketSalesByDay] = useState<any[]>([])
  const [ticketSalesByType, setTicketSalesByType] = useState<any[]>([])
  const [editFormData, setEditFormData] = useState<any>(null)
  const [discounts, setDiscounts] = useState<DiscountData[]>([])
  const [newDiscount, setNewDiscount] = useState<DiscountData>({
    code: "",
    type: "percentage",
    value: 0,
    maxUses: 1,
    usedCount: 0,
    active: true,
  })
  const [bookerBVT, setBookerBVT] = useState<string>("")
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [availableBalance, setAvailableBalance] = useState<number>(0)
  const [totalPaidOut, setTotalPaidOut] = useState<number>(0)
  const [selectedPayoutId, setSelectedPayoutId] = useState<string | null>(null)
  const [actionCode, setActionCode] = useState<string>("")
  const [visibleActionCodes, setVisibleActionCodes] = useState<Record<string, boolean>>({})

  const ticketTypeData = useMemo(() => {
    if (!eventData || !attendees.length) return []

    const typeCount: Record<string, number> = {}
    attendees.forEach((attendee) => {
      typeCount[attendee.ticketType] = (typeCount[attendee.ticketType] || 0) + 1
    })

    return Object.keys(typeCount).map((type) => ({
      type,
      count: typeCount[type],
    }))
  }, [eventData, attendees])

  const handleTabSwitch = (
    tab: "overview" | "eventlink" | "attendees" | "payouts" | "edit" | "discounts" | "merch" | "referrals" | "form" | "responses",
  ) => {
    setActiveTab(tab)
    setLoadedTabs((prev) => new Set([...Array.from(prev), tab]))
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user)
      if (user) {
        fetchEventData(user.uid)
      } else {
        setLoading(false)
      }
    })
    return () => unsubscribe()
  }, [userId, eventId])

  const fetchEventData = async (currentUserId: string) => {
    try {
      // Get user BVT
      const userDocRef = doc(db, "users", currentUserId)
      const userDoc = await getDoc(userDocRef)
      if (userDoc.exists()) {
        const userData = userDoc.data()
        if (userData.bvt) {
          setBookerBVT(userData.bvt)
        }
      }

      // Get event
      const eventDocRef = doc(db, "events", userId, "userEvents", eventId)
      const eventDoc = await getDoc(eventDocRef)

      if (eventDoc.exists()) {
        const data = eventDoc.data()
        const eventDataObj: EventData = {
          id: eventDoc.id,
          eventName: data.eventName || "",
          eventImage: data.eventImage || "/placeholder.svg",
          eventDate: data.eventDate || new Date().toISOString(),
          eventType: data.eventType || "",
          eventDescription: data.eventDescription || "",
          isFree: data.isFree || false,
          ticketPrices: data.ticketPrices || [],
          createdBy: data.createdBy || currentUserId,
          eventVenue: data.eventVenue || "",
          totalCapacity: data.enableMaxSize ? Number.parseInt(data.maxSize) : 100,
          ticketsSold: data.ticketsSold || 0,
          totalRevenue: data.totalRevenue || 0,
          eventEndDate: data.eventEndDate || "",
          eventStart: data.eventStart || "",
          eventEnd: data.eventEnd || "",
          enableMaxSize: data.enableMaxSize || false,
          maxSize: data.maxSize || "",
          enableColorCode: data.enableColorCode || false,
          colorCode: data.colorCode || "",
          enableStopDate: data.enableStopDate || false,
          stopDate: data.stopDate || "",
          payId: data.payId || "",
          availableRevenue: data.availableRevenue,
          totalPaidOut: data.totalPaidOut,
        }

        setEventData(eventDataObj)
        setEditFormData({
          ...eventDataObj,
          enablePricing: !data.isFree,
        })

        // Fetch attendees
        try {
          const attendeesCollectionRef = collection(db, "events", userId, "userEvents", eventId, "attendees")
          const attendeesSnapshot = await getDocs(attendeesCollectionRef)

          const attendeesList: AttendeeData[] = []
          attendeesSnapshot.forEach((doc) => {
            const attendeeData = doc.data()
            attendeesList.push({
              id: doc.id,
              fullName: attendeeData.fullName || "Unknown",
              email: attendeeData.email || "no-email@example.com",
              ticketType: attendeeData.ticketType || "Standard",
              verified: attendeeData.verified || false,
              purchaseDate: formatFirestoreTimestamp(attendeeData.purchaseDate),
              purchaseTime: attendeeData.purchaseTime || "Unknown",
              ticketReference: attendeeData.ticketReference || "Unknown",
            })
          })
          setAttendees(attendeesList)

          // Process ticket sales by day
          const salesByDay: Record<string, number> = {}
          attendeesList.forEach((attendee) => {
            if (attendee.purchaseDate && attendee.purchaseDate !== "Unknown") {
              salesByDay[attendee.purchaseDate] = (salesByDay[attendee.purchaseDate] || 0) + 1
            }
          })

          const salesByDayArray = Object.keys(salesByDay)
            .map((date) => ({
              date,
              count: salesByDay[date],
            }))
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

          setTicketSalesByDay(salesByDayArray)

          // Process ticket sales by type
          const salesByType: Record<string, number> = {}
          attendeesList.forEach((attendee) => {
            salesByType[attendee.ticketType] = (salesByType[attendee.ticketType] || 0) + 1
          })

          setTicketSalesByType(
            Object.keys(salesByType).map((type) => ({
              type,
              count: salesByType[type],
            })),
          )
        } catch (error) {
          console.error("Error fetching attendees:", error)
        }

        // Fetch discounts
        try {
          const discountsCollectionRef = collection(db, "events", userId, "userEvents", eventId, "discounts")
          const discountsSnapshot = await getDocs(discountsCollectionRef)

          const discountsList: DiscountData[] = []
          discountsSnapshot.forEach((doc) => {
            const discountData = doc.data() as DiscountData
            discountsList.push({
              ...discountData,
              code: discountData.code || "",
              type: discountData.type || "percentage",
              value: discountData.value || 0,
              maxUses: discountData.maxUses || 1,
              usedCount: discountData.usedCount || 0,
              active: discountData.active !== false,
            })
          })
          setDiscounts(discountsList)
        } catch (error) {
          console.error("Error fetching discounts:", error)
        }

        // Fetch payouts
        try {
          const payoutsCollectionRef = collection(db, "events", userId, "userEvents", eventId, "payouts")
          const payoutsQuery = query(payoutsCollectionRef, orderBy("createdAt", "desc"))
          const payoutsSnapshot = await getDocs(payoutsQuery)

          const payoutsList: PayoutData[] = []
          let calculatedTotalPaidOut = 0

          payoutsSnapshot.forEach((doc) => {
            const payoutData = doc.data()
            const payoutAmount = payoutData.payoutAmount || 0

            if (payoutData.status === "Confirmed") {
              calculatedTotalPaidOut += payoutAmount
            }

            payoutsList.push({
              id: doc.id,
              date: formatFirestoreTimestamp(payoutData.createdAt) || new Date().toLocaleDateString(),
              amount: payoutAmount,
              status: payoutData.status || "Pending",
              actionCode: payoutData.actionCode || "",
              reference: payoutData.reference || "",
              createdAt: payoutData.createdAt,
              payoutAmount: payoutAmount,
              payableAmount: payoutData.payableAmount || 0,
              agentName: payoutData.agentName || "",
              transactionTime: payoutData.transactionTime || formatTransactionTime(payoutData.createdAt) || "",
            })
          })

          setPayouts(payoutsList)
          setTotalPaidOut(eventDataObj.totalPaidOut ?? calculatedTotalPaidOut)
          setAvailableBalance(eventDataObj.availableRevenue ?? eventDataObj.totalRevenue - calculatedTotalPaidOut)
        } catch (error) {
          console.error("Error fetching payouts:", error)
        }
      }
    } catch (error) {
      console.error("Error fetching event data:", error)
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const handleDiscountInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    if (type === "number") {
      setNewDiscount({ ...newDiscount, [name]: Number(value) })
    } else {
      setNewDiscount({ ...newDiscount, [name]: value })
    }
  }

  const handleAddDiscount = async () => {
    try {
      setLoading(true)
      if (!currentUser || !eventId) throw new Error("User not authenticated or event ID missing")

      const codeExists = discounts.some((discount) => discount.code.toLowerCase() === newDiscount.code.toLowerCase())

      if (codeExists) {
        alert("This discount code already exists. Please use a different code.")
        setLoading(false)
        return
      }

      const discountsCollectionRef = collection(db, "events", userId, "userEvents", eventId, "discounts")
      await addDoc(discountsCollectionRef, newDiscount)

      setDiscounts([...discounts, newDiscount])

      setNewDiscount({
        code: "",
        type: "percentage",
        value: 0,
        maxUses: 1,
        usedCount: 0,
        active: true,
      })

      alert("Discount code added successfully!")
    } catch (error) {
      console.error("Error adding discount:", error)
      alert("Failed to add discount code. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleToggleDiscountStatus = async (index: number) => {
    try {
      setLoading(true)
      if (!currentUser || !eventId) throw new Error("User not authenticated or event ID missing")

      const discountToUpdate = discounts[index]
      const discountsCollectionRef = collection(db, "events", userId, "userEvents", eventId, "discounts")
      const discountsSnapshot = await getDocs(discountsCollectionRef)
      let docIdToUpdate: string | null = null

      discountsSnapshot.forEach((doc) => {
        const data = doc.data()
        if (data.code === discountToUpdate.code) {
          docIdToUpdate = doc.id
        }
      })

      if (docIdToUpdate) {
        const discountDocRef = doc(db, "events", userId, "userEvents", eventId, "discounts", docIdToUpdate)
        await updateDoc(discountDocRef, {
          active: !discountToUpdate.active,
        })

        const updatedDiscounts = [...discounts]
        updatedDiscounts[index] = {
          ...discountToUpdate,
          active: !discountToUpdate.active,
        }
        setDiscounts(updatedDiscounts)
      }
    } catch (error) {
      console.error("Error updating discount status:", error)
      alert("Failed to update discount status. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target

    if (type === "checkbox") {
      const checked = (e.target as HTMLInputElement).checked
      setEditFormData({
        ...editFormData,
        [name]: checked,
      })
    } else {
      setEditFormData({
        ...editFormData,
        [name]: value,
      })
    }
  }

  const handleTicketPriceChange = (index: number, field: string, value: string) => {
    const updatedPrices = [...editFormData.ticketPrices]
    updatedPrices[index][field as "policy" | "price"] = field === "price" ? Number(value) : value
    setEditFormData({
      ...editFormData,
      ticketPrices: updatedPrices,
    })
  }

  const addTicketPrice = () => {
    setEditFormData({
      ...editFormData,
      ticketPrices: [...editFormData.ticketPrices, { policy: "", price: 0 }],
    })
  }

  const handleSubmitEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (!currentUser || !eventId) throw new Error("User not authenticated or event ID missing")

      const updateData = {
        eventName: editFormData.eventName,
        eventDescription: editFormData.eventDescription,
        eventDate: editFormData.eventDate,
        eventEndDate: editFormData.eventEndDate,
        eventVenue: editFormData.eventVenue,
        eventStart: editFormData.eventStart,
        eventEnd: editFormData.eventEnd,
        eventType: editFormData.eventType,
        isFree: !editFormData.enablePricing,
        ticketPrices: editFormData.enablePricing ? editFormData.ticketPrices : [],
        enableStopDate: editFormData.enableStopDate,
        stopDate: editFormData.enableStopDate ? editFormData.stopDate : null,
        enableColorCode: editFormData.enableColorCode,
        colorCode: editFormData.enableColorCode ? editFormData.colorCode : null,
        enableMaxSize: editFormData.enableMaxSize,
        maxSize: editFormData.enableMaxSize ? editFormData.maxSize : null,
      }

      const eventDocRef = doc(db, "events", userId, "userEvents", eventId)
      await updateDoc(eventDocRef, updateData)

      const updatedEventDoc = await getDoc(eventDocRef)
      if (updatedEventDoc.exists()) {
        const data = updatedEventDoc.data()
        setEventData({
          ...eventData!,
          eventName: data.eventName || "",
          eventDescription: data.eventDescription || "",
          eventDate: data.eventDate || "",
          eventEndDate: data.eventEndDate || "",
          eventVenue: data.eventVenue || "",
          eventStart: data.eventStart || "",
          eventEnd: data.eventEnd || "",
          eventType: data.eventType || "",
          isFree: data.isFree || false,
          ticketPrices: data.ticketPrices || [],
        })
      }

      alert("Event updated successfully!")
      handleTabSwitch("overview")
    } catch (error) {
      console.error("Error updating event:", error)
      alert("Failed to update event. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const toggleActionCodeVisibility = (payoutId: string) => {
    setVisibleActionCodes((prev) => ({
      ...prev,
      [payoutId]: !prev[payoutId],
    }))
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="animate-pulse">
            <div className="h-10 w-40 bg-slate-200 rounded mb-8" />
            <div className="h-64 w-full bg-slate-200 rounded-lg mb-6" />
            <div className="grid grid-cols-4 gap-4 mb-8">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-24 bg-slate-200 rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!eventData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
        <Nav />
        <div className="max-w-6xl mx-auto">
          <Link href="/events">
            <button className="flex items-center gap-2 px-4 py-2 border border-slate-300 bg-white text-slate-700 rounded-lg hover:bg-slate-50 transition-colors mb-4">
              <ArrowLeft size={18} />
              Back to Events
            </button>
          </Link>
          <div className="bg-white rounded-lg border border-slate-200 p-6 text-center">
            <p className="text-slate-600">Event not found</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50">
        <Nav />
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link href="/events">
            <button className="flex items-center gap-2 px-4 py-2 border border-slate-300 bg-white text-slate-700 rounded-lg hover:bg-slate-50 transition-colors mb-4">
              <ArrowLeft size={18} />
              Back to Events
            </button>
          </Link>
          <h1 className="text-4xl font-bold text-slate-900">{eventData.eventName}</h1>
          <p className="text-slate-600 mt-2">{eventData.eventVenue}</p>
        </div>

        <div className="space-y-6">
          {/* Tab Navigation */}
          <div className="border-b border-slate-200 bg-white rounded-t-lg">
            <div className="flex overflow-x-auto [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-slate-100 [&::-webkit-scrollbar-thumb]:bg-[#6b2fa5] [&::-webkit-scrollbar-thumb]:rounded-full">
              {(["overview", "eventlink", "attendees", "discounts", "merch", "referrals", "form", "responses", "payouts", "edit"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => handleTabSwitch(tab)}
                  className={`px-6 py-3 font-semibold border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === tab
                      ? "border-b-purple-600 text-purple-600"
                      : "border-b-transparent text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {tab === "overview"
                    ? "Overview"
                    : tab === "eventlink"
                     ? "Event Link"
                    : tab === "attendees"
                      ? "Attendees"
                      : tab === "discounts"
                        ? "Discounts"
                        : tab === "merch"
                          ? "Merch"
                          : tab === "referrals"
                            ? "Referrals"
                            : tab === "form"
                              ? "Form"
                              : tab === "responses"
                                ? "Responses"
                                : tab === "payouts"
                                  ? "Payouts"
                                  : "Edit Event"}
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content */}
          <div className="bg-white rounded-b-lg border border-slate-200 p-6">
            {activeTab === "overview" && (
              <>
                {loadedTabs.has("overview") && eventData ? (
                  <OverviewTab
                    eventData={eventData}
                    availableBalance={availableBalance}
                    totalPaidOut={totalPaidOut}
                    copiedField={copiedField}
                    bookerBVT={bookerBVT}
                    ticketSalesByDay={ticketSalesByDay}
                    ticketTypeData={ticketTypeData}
                    copyToClipboard={copyToClipboard}
                  />
                ) : (
                  <TabSkeleton />
                )}
              </>
            )}

          {activeTab === "eventlink" && (
              <>
              {loadedTabs.has("eventlink") && eventData && currentUser ? (
             <EventLinkTab
                  eventData={eventData}
                  userId={userId}
                  currentUserId={currentUser.uid}
      />
    ) : (
      <TabSkeleton />
    )}
  </>
)}


            {activeTab === "attendees" && (
              <>
                {loadedTabs.has("attendees") ? (
                  <AttendeesTab attendees={attendees} formatFirestoreTimestamp={formatFirestoreTimestamp} />
                ) : (
                  <TabSkeleton />
                )}
              </>
            )}

            {activeTab === "discounts" && (
              <>
                {loadedTabs.has("discounts") ? (
                  <DiscountsTab
                    discounts={discounts}
                    newDiscount={newDiscount}
                    handleDiscountInputChange={handleDiscountInputChange}
                    handleAddDiscount={handleAddDiscount}
                    handleToggleDiscountStatus={handleToggleDiscountStatus}
                  />
                ) : (
                  <TabSkeleton />
                )}
              </>
            )}

            {activeTab === "merch" && (
              <>
                {loadedTabs.has("merch") && currentUser && eventData ? (
                  <MerchTab
                    userId={userId}
                    eventId={eventId}
                    eventName={eventData.eventName}
                    currentUserId={currentUser.uid}
                  />
                ) : (
                  <TabSkeleton />
                )}
              </>
            )}

            {activeTab === "referrals" && (
              <>{loadedTabs.has("referrals") ? <ReferralsTab userId={userId} eventId={eventId} /> : <TabSkeleton />}</>
            )}

            {activeTab === "form" && (
              <>
                {loadedTabs.has("form") && eventData ? (
                  <FormTab
                    userId={userId}
                    eventId={eventId}
                    ticketTypes={eventData.ticketPrices || []}
                  />
                ) : (
                  <TabSkeleton />
                )}
              </>
            )}

            {activeTab === "responses" && (
              <>
                {loadedTabs.has("responses") ? (
                  <ResponsesTab userId={userId} eventId={eventId} />
                ) : (
                  <TabSkeleton />
                )}
              </>
            )}

            {activeTab === "payouts" && (
              <>
                {loadedTabs.has("payouts") && eventData ? (
                  <PayoutsTab
                    availableBalance={availableBalance}
                    eventData={eventData}
                    userId={userId}
                    eventId={eventId}
                    currentUserId={currentUser?.uid || ""}
                    attendees={attendees}
                    payId={eventData?.payId || ""}
                  />
                ) : (
                  <TabSkeleton />
                )}
              </>
            )}


            {activeTab === "edit" && (
              <>
                {loadedTabs.has("edit") && editFormData ? (
                  <EditEventTab
                    editFormData={editFormData}
                    handleInputChange={handleInputChange}
                    handleTicketPriceChange={handleTicketPriceChange}
                    addTicketPrice={addTicketPrice}
                    handleSubmitEdit={handleSubmitEdit}
                    setEditFormData={setEditFormData} userId={""} eventId={""}                  />
                ) : (
                  <TabSkeleton />
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}