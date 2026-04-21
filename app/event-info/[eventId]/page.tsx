// app/event-info/[eventId]/page.tsx
"use client"

import { useMemo, use, useState, useEffect, useRef, Suspense } from "react"
import type React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { tryRefreshTokens, getAccessToken } from "@/lib/auth-client"
import { auth } from "@/lib/firebase"
import { onAuthStateChanged } from "firebase/auth"
import { ArrowLeft, RefreshCw, LogOut, Shield, UserCheck, Calculator, AlertTriangle, Settings } from "lucide-react"
import { eventCacheManager } from "@/lib/cache-manger"
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
import WeatherTab from "@/components/event-info/weather-tab"
import TransferTab from "@/components/event-info/transfer-tab"

// ── Types ──────────────────────────────────────────────────────────────────────
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
  status?: string
}

interface AttendeeData {
  id: string; fullName: string; email: string; ticketType: string
  verified: boolean; purchaseDate: string; purchaseTime: string
  ticketReference: string; facialEnroll: "enrolled" | "unenrolled"
  faceEmbedding?: number[] | null
}

interface DiscountData {
  id?: string; code: string; type: "percentage" | "flat"
  value: number; maxUses: number; usedCount: number; active: boolean
}

type CollabRole = "admin" | "checkin" | "accountant" | string

interface CollabInfo {
  collaborationId: string
  role: CollabRole
  ownerId: string
  permissions: string[] | null // null = built-in role; array = custom role tabs
}

// ── Built-in role → allowed tab IDs ───────────────────────────────────────────
// These are the SOURCE OF TRUTH — no Firestore lookup needed for built-in roles.
const BUILT_IN_ROLE_TABS: Record<string, TabId[]> = {
  admin:      ["overview", "eventlink", "payouts", "attendees", "discounts", "merch", "referrals", "form", "responses", "weather", "transfer"],
  checkin:    ["attendees", "eventlink", "weather", "form", "responses"],
  accountant: ["overview", "eventlink", "payouts", "discounts", "merch"],
}

// Maps permission IDs (stored in Firestore for custom roles) → TabId
const PERMISSION_TO_TAB: Record<string, TabId> = {
  overview:  "overview",
  attendees: "attendees",
  payouts:   "payouts",
  discounts: "discounts",
  merch:     "merch",
  referrals: "referrals",
  form:      "form",
  responses: "responses",
  weather:   "weather",
  share:     "eventlink",
  transfer:  "transfer",
}

// ── All tabs ───────────────────────────────────────────────────────────────────
const ALL_TABS = [
  "overview", "eventlink", "payouts", "attendees",
  "discounts", "merch", "referrals", "form", "responses",
  "weather", "transfer", "edit", "teams",
] as const

type TabId = typeof ALL_TABS[number]

const TAB_LABELS: Record<TabId, string> = {
  overview:  "Overview",   eventlink: "Share Event", attendees: "Attendees",
  discounts: "Discounts",  merch:     "Merch",       referrals: "Referrals",
  form:      "Form",       payouts:   "Payouts",     responses: "Responses",
  weather:   "Weather",    transfer:  "Transfer Event", edit:   "Edit Event",
  teams:     "Teams",
}

// ── Resolve which tabs a user can see ─────────────────────────────────────────
function resolveVisibleTabs(isOwner: boolean, collab: CollabInfo | null): TabId[] {
  if (isOwner) return [...ALL_TABS] as TabId[]
  if (!collab) return []

  // Built-in role — use hardcoded template
  if (collab.role in BUILT_IN_ROLE_TABS) {
    return BUILT_IN_ROLE_TABS[collab.role]
  }

  // Custom role — map stored permission IDs to tab IDs
  if (Array.isArray(collab.permissions) && collab.permissions.length > 0) {
    return collab.permissions
      .map((p) => PERMISSION_TO_TAB[p.toLowerCase()])
      .filter((t): t is TabId => Boolean(t))
  }

  return []
}

// ── Role badge ─────────────────────────────────────────────────────────────────
function RoleBadge({ role }: { role: string }) {
  const built: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    admin:      { label: "Admin",      cls: "bg-rose-50 text-rose-700 border-rose-200",       icon: <Shield size={12} /> },
    checkin:    { label: "Check-in",   cls: "bg-blue-50 text-blue-700 border-blue-200",       icon: <UserCheck size={12} /> },
    accountant: { label: "Accountant", cls: "bg-purple-50 text-purple-700 border-purple-200", icon: <Calculator size={12} /> },
  }
  const c = built[role] ?? { label: role, cls: "bg-slate-50 text-slate-700 border-slate-200", icon: <Settings size={12} /> }
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${c.cls}`}>
      {c.icon}{c.label}
    </span>
  )
}

// ── Exit dialog ────────────────────────────────────────────────────────────────
function ExitTeamDialog({ eventName, onConfirm, onCancel, loading }: {
  eventName: string; onConfirm: () => void; onCancel: () => void; loading: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onCancel() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={20} className="text-red-500" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Exit Team</h3>
            <p className="text-sm text-slate-500">This cannot be undone</p>
          </div>
        </div>
        <p className="text-sm text-slate-600">
          You&apos;ll lose access to <span className="font-semibold">{eventName}</span>. The owner will need to re-add you.
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel} disabled={loading}
            className="flex-1 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <LogOut size={15} />}
            Exit Team
          </button>
        </div>
      </div>
    </div>
  )
}

function TabSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-32 bg-slate-200 rounded-lg" />
      <div className="h-24 bg-slate-200 rounded-lg" />
      <div className="grid grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-slate-200 rounded-lg" />)}
      </div>
    </div>
  )
}

// ── Inner page (needs useSearchParams) ────────────────────────────────────────
function EventInfoInner({ eventId, userId }: { eventId: string; userId: string }) {
  const router      = useRouter()
  const searchParams = useSearchParams()
  const roleHint    = searchParams.get("role") // ?role= hint from collaborated events list

  const [pageReady, setPageReady]       = useState(false) // replaces loading+accessChecked
  const [saving, setSaving]             = useState(false)
  const [refreshing, setRefreshing]     = useState(false)
  const [currentUser, setCurrentUser]   = useState<any>(null)
  const [eventData, setEventData]       = useState<EventData | null>(null)
  const [attendees, setAttendees]       = useState<AttendeeData[]>([])
  const [discounts, setDiscounts]       = useState<DiscountData[]>([])
  const [payouts, setPayouts]           = useState<any[]>([])
  const [bookerBVT, setBookerBVT]       = useState("")
  const [ticketSalesByDay, setTicketSalesByDay] = useState<any[]>([])
  const [ticketSalesByType, setTicketSalesByType] = useState<any[]>([])
  const [availableBalance, setAvailableBalance]   = useState(0)
  const [totalPaidOut, setTotalPaidOut]   = useState(0)
  const [editFormData, setEditFormData]   = useState<any>(null)
  const [copiedField, setCopiedField]     = useState<string | null>(null)
  const [cacheInfo, setCacheInfo]         = useState<{ isCached: boolean; remainingTime: number | null }>({ isCached: false, remainingTime: null })
  const [activeTab, setActiveTab]         = useState<TabId>("overview")
  const [loadedTabs, setLoadedTabs]       = useState<Set<string>>(new Set(["overview"]))
  const [newDiscount, setNewDiscount]     = useState<DiscountData>({ code: "", type: "percentage", value: 0, maxUses: 1, usedCount: 0, active: true })

  const [isOwner, setIsOwner]             = useState(false)
  const [collabInfo, setCollabInfo]       = useState<CollabInfo | null>(null)
  const [exitDialog, setExitDialog]       = useState(false)
  const [exitLoading, setExitLoading]     = useState(false)

  // Tracks whether Firebase has emitted at least one non-null user.
  // Lives in a ref so it survives Strict Mode double-effect invocations
  // and is shared across both listener registrations — preventing the
  // cold-start null from triggering a redirect on either run.
  const firebaseInitialized = useRef(false)

  const visibleTabs = useMemo(
    () => resolveVisibleTabs(isOwner, collabInfo),
    [isOwner, collabInfo]
  )

  const ticketTypeData = useMemo(() => {
    if (!eventData || !attendees.length) return []
    const tc: Record<string, number> = {}
    attendees.forEach((a) => { tc[a.ticketType] = (tc[a.ticketType] || 0) + 1 })
    return Object.keys(tc).map((type) => ({ type, count: tc[type] }))
  }, [eventData, attendees])

  const handleTabSwitch = (tab: TabId) => {
    if (!visibleTabs.includes(tab)) return
    setActiveTab(tab)
    setLoadedTabs((prev) => new Set([...Array.from(prev), tab]))
  }

  function populateEventData(data: any) {
    console.log("[EventInfo] populateEventData — keys:", Object.keys(data))
    setEventData(data.eventData ?? null)
    setBookerBVT(data.bookerBVT ?? "")
    setAttendees(data.attendees ?? [])
    setDiscounts(data.discounts ?? [])
    setPayouts(data.payouts ?? [])
    setTicketSalesByDay(data.ticketSalesByDay ?? [])
    setTicketSalesByType(data.ticketSalesByType ?? [])
    setAvailableBalance(data.availableBalance ?? 0)
    setTotalPaidOut(data.totalPaidOut ?? 0)
    if (data.eventData) {
      setEditFormData({ ...data.eventData, enablePricing: !data.eventData.isFree })
    }
  }

  // ── Main load function ────────────────────────────────────────────────────
  async function loadPage(uid: string, forceRefresh = false) {
    console.log("[EventInfo] loadPage — uid:", uid, "eventId:", eventId, "roleHint:", roleHint, "forceRefresh:", forceRefresh)

    try {
      // ── Try cache (owner path only) ───────────────────────────────────────
      if (!forceRefresh) {
        const cached = eventCacheManager.get<any>(`event_${eventId}`)
        if (cached) {
          console.log("[EventInfo] Cache hit")
          const ownerId = cached.eventData?.createdBy
          if (uid === ownerId) {
            console.log("[EventInfo] Cache: confirmed owner")
            populateEventData(cached)
            setIsOwner(true)
            const rem = eventCacheManager.getRemainingTime(`event_${eventId}`)
            setCacheInfo({ isCached: true, remainingTime: rem })
            setPageReady(true)
            return
          }
          // Different user — don't use owner cache, fall through
          console.log("[EventInfo] Cache belongs to different owner, skipping")
        }
      } else {
        eventCacheManager.invalidate(`event_${eventId}`)
        setRefreshing(true)
      }

      // ── Step 1: try owner API ─────────────────────────────────────────────
      console.log("[EventInfo] Fetching owner data from /api/event/list/" + eventId)
      const ownerRes = await fetch(`/api/event/list/${eventId}`)
      console.log("[EventInfo] Owner fetch status:", ownerRes.status)

      if (ownerRes.ok) {
        const data = await ownerRes.json()
        console.log("[EventInfo] Owner fetch success — eventName:", data.eventData?.eventName)
        eventCacheManager.set(`event_${eventId}`, data)
        populateEventData(data)
        setIsOwner(true)
        setCacheInfo({ isCached: false, remainingTime: null })
        setPageReady(true)
        return
      }

      // ── Step 2: not owner — check collaboration ───────────────────────────
      console.log("[EventInfo] Not owner (status " + ownerRes.status + "), checking collaboration...")
      await loadCollabAccess(uid)

    } catch (err) {
      console.error("[EventInfo] loadPage error:", err)
    } finally {
      setRefreshing(false)
      setPageReady(true) // always unblock the UI
    }
  }

  async function loadCollabAccess(uid: string) {
    console.log("[EventInfo] loadCollabAccess — uid:", uid, "eventId:", eventId)
    try {
      const res = await fetch(`/api/teams?eventId=${eventId}&action=myAccess`)
      console.log("[EventInfo] myAccess status:", res.status)

      if (!res.ok) {
        console.warn("[EventInfo] myAccess failed:", res.status)
        return
      }

      const data = await res.json()
      console.log("[EventInfo] myAccess response — role:", data.collaboration?.role, "hasEventData:", !!data.eventData)

      if (!data.collaboration || !data.eventData) {
        console.warn("[EventInfo] myAccess: missing collaboration or eventData in response")
        return
      }

      const role: string = data.collaboration.role
      const permissions: string[] | null = data.collaboration.permissions ?? null

      console.log("[EventInfo] Collab role:", role, "permissions:", permissions)

      // Resolve which tabs this role can see
      let allowedTabs: TabId[]
      if (role in BUILT_IN_ROLE_TABS) {
        allowedTabs = BUILT_IN_ROLE_TABS[role]
        console.log("[EventInfo] Built-in role tabs:", allowedTabs)
      } else if (Array.isArray(permissions) && permissions.length > 0) {
        allowedTabs = permissions
          .map((p) => PERMISSION_TO_TAB[p.toLowerCase()])
          .filter((t): t is TabId => Boolean(t))
        console.log("[EventInfo] Custom role tabs:", allowedTabs)
      } else {
        allowedTabs = []
        console.warn("[EventInfo] No permissions resolved for role:", role)
      }

      setCollabInfo({
        collaborationId: data.collaboration.collaborationId,
        role,
        ownerId: data.collaboration.ownerId,
        permissions,
      })

      populateEventData({
        eventData:       data.eventData,
        attendees:       data.attendees ?? [],
        discounts:       [],
        payouts:         [],
        ticketSalesByDay: [],
        ticketSalesByType: [],
        availableBalance: 0,
        totalPaidOut:    0,
      })

      // Set default tab to the first one this role can see
      if (allowedTabs.length > 0) {
        console.log("[EventInfo] Setting default tab to:", allowedTabs[0])
        setActiveTab(allowedTabs[0])
        setLoadedTabs(new Set([allowedTabs[0]]))
      }

    } catch (err) {
      console.error("[EventInfo] loadCollabAccess error:", err)
    }
  }

  // ── Auth bootstrap ────────────────────────────────────────────────────────
  useEffect(() => {
    console.log("[EventInfo] useEffect — setting up auth listener, eventId:", eventId)

    // Ensure we have a token first
    const ensureAuth = async (): Promise<boolean> => {
      try {
        let token = getAccessToken()
        if (!token) {
          console.log("[EventInfo] No token, attempting refresh...")
          const ok = await tryRefreshTokens()
          if (!ok) { console.warn("[EventInfo] Refresh failed"); router.push("/login"); return false }
          console.log("[EventInfo] Token refreshed")
        }
        return true
      } catch (e) {
        console.error("[EventInfo] Auth error:", e)
        router.push("/login")
        return false
      }
    }

    let unsubscribe: (() => void) | undefined

    ensureAuth().then((authed) => {
      if (!authed) return

      // Firebase emits null on the very first tick while it restores the
      // persisted session from IndexedDB. We must not redirect on that
      // initial null — only redirect once Firebase has confirmed there is
      // genuinely no signed-in user (i.e. after it has emitted a real user).
      // firebaseInitialized is a ref so it survives Strict Mode double-invocation.
      unsubscribe = onAuthStateChanged(auth, (user) => {
        console.log("[EventInfo] onAuthStateChanged — user:", user?.uid ?? "null", "initialized:", firebaseInitialized.current)
        if (user) {
          firebaseInitialized.current = true
          setCurrentUser(user)
          loadPage(user.uid)
        } else if (firebaseInitialized.current) {
          // User was signed in before and is now gone — genuine sign-out
          console.warn("[EventInfo] Firebase user signed out, redirecting to login")
          router.push("/login")
        } else {
          // First emission is null — Firebase is still restoring the session.
          // Mark initialized and wait for the next emission.
          firebaseInitialized.current = true
          console.log("[EventInfo] Firebase cold-start null — waiting for session restore")
        }
      })
    })

    return () => {
      if (unsubscribe) unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  const handleRefreshData = () => {
    if (currentUser) loadPage(currentUser.uid, true)
  }

  // ── Clipboard ─────────────────────────────────────────────────────────────
  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  // ── Discounts ─────────────────────────────────────────────────────────────
  const handleDiscountInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    setNewDiscount((prev) => ({ ...prev, [name]: type === "number" ? Number(value) : value }))
  }

  const handleAddDiscount = async () => {
    if (!newDiscount.code.trim()) { alert("Please enter a discount code."); return }
    setSaving(true)
    try {
      const res  = await fetch(`/api/event/list/${eventId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "addDiscount", ...newDiscount }) })
      const data = await res.json()
      if (!res.ok) { alert(data.error ?? "Failed to add discount."); return }
      setDiscounts((prev) => [...prev, data.discount])
      setNewDiscount({ code: "", type: "percentage", value: 0, maxUses: 1, usedCount: 0, active: true })
      alert("Discount code added successfully!")
    } catch { alert("Failed to add discount code.") }
    finally { setSaving(false) }
  }

  const handleToggleDiscountStatus = async (index: number) => {
    const target = discounts[index]
    if (!target.id) return
    setSaving(true)
    try {
      const res  = await fetch(`/api/event/list/${eventId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "toggleDiscount", discountId: target.id }) })
      const data = await res.json()
      if (!res.ok) { alert(data.error ?? "Failed."); return }
      setDiscounts((prev) => prev.map((d, i) => i === index ? { ...d, active: data.active } : d))
    } catch { alert("Failed.") }
    finally { setSaving(false) }
  }

  // ── Edit event ────────────────────────────────────────────────────────────
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    if (type === "checkbox") setEditFormData((p: any) => ({ ...p, [name]: (e.target as HTMLInputElement).checked }))
    else setEditFormData((p: any) => ({ ...p, [name]: value }))
  }

  const handleTicketPriceChange = (index: number, field: string, value: string) => {
    const updated = [...editFormData.ticketPrices]
    updated[index][field as "policy" | "price"] = field === "price" ? Number(value) : value
    setEditFormData((p: any) => ({ ...p, ticketPrices: updated }))
  }

  const addTicketPrice = () => setEditFormData((p: any) => ({ ...p, ticketPrices: [...p.ticketPrices, { policy: "", price: 0 }] }))

  const handleSubmitEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res  = await fetch(`/api/event/list/${eventId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "edit", ...editFormData }) })
      const data = await res.json()
      if (!res.ok) { alert(data.error ?? "Failed to update event."); return }
      setEventData((prev) => prev ? { ...prev, eventName: editFormData.eventName, eventDescription: editFormData.eventDescription, eventDate: editFormData.eventDate, eventEndDate: editFormData.eventEndDate, eventVenue: editFormData.eventVenue, eventStart: editFormData.eventStart, eventEnd: editFormData.eventEnd, eventType: editFormData.eventType, isFree: !editFormData.enablePricing, ticketPrices: editFormData.enablePricing ? editFormData.ticketPrices : [], enableStopDate: editFormData.enableStopDate, stopDate: editFormData.enableStopDate ? editFormData.stopDate : "", enableColorCode: editFormData.enableColorCode, colorCode: editFormData.enableColorCode ? editFormData.colorCode : "", enableMaxSize: editFormData.enableMaxSize, maxSize: editFormData.enableMaxSize ? editFormData.maxSize : "" } : prev)
      alert("Event updated successfully!")
      handleTabSwitch("overview")
    } catch { alert("Failed to update event.") }
    finally { setSaving(false) }
  }

  // ── Exit team ─────────────────────────────────────────────────────────────
  async function handleExitTeam() {
    if (!collabInfo) return
    setExitLoading(true)
    try {
      const res = await fetch("/api/teams", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ collaborationId: collabInfo.collaborationId }) })
      if (res.ok) { router.push("/events"); return }
      const data = await res.json().catch(() => ({}))
      alert(data.error ?? "Failed to exit team.")
    } catch { alert("Network error.") }
    finally { setExitLoading(false); setExitDialog(false) }
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (!pageReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
        <div className="max-w-6xl mx-auto animate-pulse">
          <div className="h-10 w-40 bg-slate-200 rounded mb-8" />
          <div className="h-64 w-full bg-slate-200 rounded-lg mb-6" />
          <div className="grid grid-cols-4 gap-4 mb-8">
            {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-slate-200 rounded-lg" />)}
          </div>
        </div>
      </div>
    )
  }

  if (!eventData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
        <div className="max-w-6xl mx-auto">
          <Link href="/events"><button className="flex items-center gap-2 px-4 py-2 border border-slate-300 bg-white text-slate-700 rounded-lg hover:bg-slate-50 mb-4"><ArrowLeft size={18} /> Back to Events</button></Link>
          <div className="bg-white rounded-lg border border-slate-200 p-6 text-center">
            <p className="text-slate-600">Event not found or you don&apos;t have access to this event.</p>
          </div>
        </div>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50">
      {exitDialog && (
        <ExitTeamDialog
          eventName={eventData.eventName}
          onConfirm={handleExitTeam}
          onCancel={() => setExitDialog(false)}
          loading={exitLoading}
        />
      )}

      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <Link href="/events">
              <button className="flex items-center gap-2 px-4 py-2 border border-slate-300 bg-white text-slate-700 rounded-lg hover:bg-slate-50 transition-colors">
                <ArrowLeft size={18} /> Back to Events
              </button>
            </Link>
            <div className="flex items-center gap-3">
              {collabInfo && (
                <>
                  <RoleBadge role={collabInfo.role} />
                  <button onClick={() => setExitDialog(true)}
                    className="flex items-center gap-2 px-4 py-2 border border-red-200 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium">
                    <LogOut size={15} /> Exit Team
                  </button>
                </>
              )}
              {isOwner && (
                <>
                  {cacheInfo.isCached && cacheInfo.remainingTime !== null && (
                    <span className="text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                      Cached for {Math.ceil(cacheInfo.remainingTime / 1000)}s
                    </span>
                  )}
                  <button onClick={handleRefreshData} disabled={refreshing}
                    className="flex items-center gap-2 px-4 py-2 border border-slate-300 bg-white text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-50">
                    <RefreshCw size={18} className={refreshing ? "animate-spin" : ""} />
                    {refreshing ? "Refreshing..." : "Refresh"}
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <h1 className="text-4xl font-bold text-slate-900">{eventData.eventName}</h1>
            <p className="text-slate-600">{eventData.eventVenue}</p>
            {collabInfo && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-slate-500">Team member ·</span>
                <RoleBadge role={collabInfo.role} />
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {/* Tabs */}
          <div className="border-b border-slate-200 bg-white rounded-t-lg">
            <div className="flex overflow-x-auto [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-slate-100 [&::-webkit-scrollbar-thumb]:bg-[#6b2fa5] [&::-webkit-scrollbar-thumb]:rounded-full">
              {visibleTabs.map((tab) => (
                <button key={tab} onClick={() => handleTabSwitch(tab)}
                  className={`px-6 py-3 font-semibold border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === tab ? "border-b-purple-600 text-purple-600" : "border-b-transparent text-slate-600 hover:text-slate-900"
                  }`}>
                  {TAB_LABELS[tab]}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="bg-white rounded-b-lg border border-slate-200 p-6">

            {activeTab === "overview" && visibleTabs.includes("overview") && (
              loadedTabs.has("overview") && eventData
                ? <OverviewTab eventData={eventData} availableBalance={availableBalance} totalPaidOut={totalPaidOut} copiedField={copiedField} bookerBVT={bookerBVT} ticketSalesByDay={ticketSalesByDay} ticketTypeData={ticketTypeData} copyToClipboard={copyToClipboard} />
                : <TabSkeleton />
            )}

            {activeTab === "eventlink" && visibleTabs.includes("eventlink") && (
              loadedTabs.has("eventlink") && eventData ? <EventLinkTab eventId={eventData.id} /> : <TabSkeleton />
            )}

            {activeTab === "attendees" && visibleTabs.includes("attendees") && (
              loadedTabs.has("attendees")
                ? <AttendeesTab attendees={attendees} formatFirestoreTimestamp={(ts: any) => ts} eventId={eventId} />
                : <TabSkeleton />
            )}

            {activeTab === "discounts" && visibleTabs.includes("discounts") && (
              loadedTabs.has("discounts")
                ? <DiscountsTab discounts={discounts} newDiscount={newDiscount} handleDiscountInputChange={handleDiscountInputChange} handleAddDiscount={handleAddDiscount} handleToggleDiscountStatus={handleToggleDiscountStatus} />
                : <TabSkeleton />
            )}

            {activeTab === "merch" && visibleTabs.includes("merch") && (
              loadedTabs.has("merch") && currentUser && eventData
                ? <MerchTab eventId={eventId} eventName={eventData.eventName} currentUserId={currentUser.uid} />
                : <TabSkeleton />
            )}

            {activeTab === "referrals" && visibleTabs.includes("referrals") && (
              loadedTabs.has("referrals") ? <ReferralsTab eventId={eventId} /> : <TabSkeleton />
            )}

            {activeTab === "form" && visibleTabs.includes("form") && (
              loadedTabs.has("form") && eventData
                ? <FormTab userId={userId} eventId={eventId} ticketTypes={eventData.ticketPrices ?? []} />
                : <TabSkeleton />
            )}

            {activeTab === "responses" && visibleTabs.includes("responses") && (
              loadedTabs.has("responses") ? <ResponsesTab userId={userId} eventId={eventId} /> : <TabSkeleton />
            )}

            {activeTab === "payouts" && visibleTabs.includes("payouts") && (
              loadedTabs.has("payouts") && eventData
                ? <PayoutsTab availableBalance={availableBalance} eventData={eventData} userId={userId} eventId={eventId} currentUserId={currentUser?.uid ?? ""} attendees={attendees} payId={eventData.payId ?? ""} />
                : <TabSkeleton />
            )}

            {activeTab === "weather" && visibleTabs.includes("weather") && (
              <WeatherTab eventId={eventId} />
            )}

            {activeTab === "transfer" && visibleTabs.includes("transfer") && (
              loadedTabs.has("transfer") && eventData
                ? <TransferTab eventId={eventId} organizerId={eventData.createdBy ?? ""} currentUserId={currentUser?.uid ?? ""} eventName={""} />
                : <TabSkeleton />
            )}

            {activeTab === "edit" && visibleTabs.includes("edit") && (
              loadedTabs.has("edit") && editFormData
                ? <EditEventTab editFormData={editFormData} handleInputChange={handleInputChange} handleTicketPriceChange={handleTicketPriceChange} addTicketPrice={addTicketPrice} handleSubmitEdit={handleSubmitEdit} setEditFormData={setEditFormData} userId="" eventId="" />
                : <TabSkeleton />
            )}

            {activeTab === "teams" && visibleTabs.includes("teams") && (
              <div className="text-center py-16 space-y-4">
                <div className="w-16 h-16 rounded-full bg-purple-50 border border-purple-200 flex items-center justify-center mx-auto">
                  <Shield size={28} className="text-purple-500" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-700 mb-1">Team Management</h3>
                  <p className="text-sm text-slate-500 max-w-sm mx-auto">Add collaborators, assign roles, and manage who can access this event.</p>
                </div>
                <Link href={`/teams?eventId=${eventId}`}>
                  <button className="px-6 py-2.5 bg-[#6b2fa5] text-white rounded-xl font-semibold hover:bg-[#5a2589] transition-colors">
                    Open Teams Page
                  </button>
                </Link>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}

// ── Page export — unwrap params + Suspense for useSearchParams ─────────────────
export default function EventInfoPage({
  params,
}: {
  params: Promise<{ userId: string; eventId: string }>
}) {
  const { userId, eventId } = use(params)
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
        <div className="max-w-6xl mx-auto animate-pulse">
          <div className="h-10 w-40 bg-slate-200 rounded mb-8" />
          <div className="h-64 w-full bg-slate-200 rounded-lg mb-6" />
        </div>
      </div>
    }>
      <EventInfoInner eventId={eventId} userId={userId} />
    </Suspense>
  )
}