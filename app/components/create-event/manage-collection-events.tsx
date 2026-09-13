"use client"

/**
 * ManageCollectionEvents
 *
 * The actual "add/remove events" screen for a collection (item 3 of the
 * Sep 2026 create-event fixes). Two lists:
 *
 *  - "In this collection" — events already attached, each with a Remove
 *    button (DELETE /api/collections/{id}/events/{eventId}).
 *  - "Your events" — every event the organizer has created (GET
 *    /api/event/list?action=owned), filterable by a search box, each with
 *    an Add button (POST /api/collections/{id}/events) unless it's
 *    already in this collection or already belongs to a different one.
 *
 * Events themselves are never created here — that's still the normal
 * One-Time Event flow. This screen only manages the association.
 */

import { useEffect, useState } from "react"
import Image from "next/image"
import { authFetch } from "@/lib/auth-client"
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  FolderOpen,
  ImageIcon,
  MapPin,
  Plus,
  Search,
  Trash2,
} from "lucide-react"
import { Preloader } from "@/components/preloader"

interface CollectionEvent {
  eventId: string
  eventName: string
  eventImage: string | null
  eventDate: string | null
  eventVenue: string | null
}

interface OwnedEvent {
  id: string
  eventName: string
  eventImage: string | null
  eventDate: string
  eventVenue: string
  status: string
  collectionId: string | null
}

interface ManageCollectionEventsProps {
  collectionId: string
  collectionName: string
  onBack: () => void
}

export function ManageCollectionEvents({ collectionId, collectionName, onBack }: ManageCollectionEventsProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [collectionEvents, setCollectionEvents] = useState<CollectionEvent[]>([])
  const [ownedEvents, setOwnedEvents] = useState<OwnedEvent[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState("")

  const loadData = async () => {
    setLoading(true)
    setError("")
    try {
      const [collectionRes, ownedRes] = await Promise.all([
        authFetch(`/api/collections/${collectionId}`),
        authFetch("/api/event/list?action=owned"),
      ])
      const collectionData = await collectionRes.json()
      const ownedData = await ownedRes.json()

      if (!collectionRes.ok) throw new Error(collectionData.error || "Failed to load collection")
      if (!ownedRes.ok) throw new Error(ownedData.error || "Failed to load your events")

      setCollectionEvents(collectionData.events || [])
      setOwnedEvents(ownedData.events || [])
    } catch (err: any) {
      setError(err.message || "Failed to load collection data")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionId])

  const inCollectionIds = new Set(collectionEvents.map((e) => e.eventId))

  const handleAdd = async (eventId: string) => {
    setActionError("")
    setPendingId(eventId)
    try {
      const res = await authFetch(`/api/collections/${collectionId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to add event")

      const added = ownedEvents.find((e) => e.id === eventId)
      if (added) {
        setCollectionEvents((prev) => [
          {
            eventId: added.id,
            eventName: added.eventName,
            eventImage: added.eventImage,
            eventDate: added.eventDate,
            eventVenue: added.eventVenue,
          },
          ...prev,
        ])
        setOwnedEvents((prev) =>
          prev.map((e) => (e.id === eventId ? { ...e, collectionId } : e))
        )
      }
    } catch (err: any) {
      setActionError(err.message || "Failed to add event to collection")
    } finally {
      setPendingId(null)
    }
  }

  const handleRemove = async (eventId: string) => {
    setActionError("")
    setPendingId(eventId)
    try {
      const res = await authFetch(`/api/collections/${collectionId}/events/${eventId}`, {
        method: "DELETE",
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to remove event")

      setCollectionEvents((prev) => prev.filter((e) => e.eventId !== eventId))
      setOwnedEvents((prev) =>
        prev.map((e) => (e.id === eventId ? { ...e, collectionId: null } : e))
      )
    } catch (err: any) {
      setActionError(err.message || "Failed to remove event from collection")
    } finally {
      setPendingId(null)
    }
  }

  const filteredOwned = ownedEvents.filter((e) =>
    e.eventName.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const formatDate = (value: string | null) => {
    if (!value) return null
    const d = new Date(value)
    if (isNaN(d.getTime())) return value
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
  }

  return (
    <>
      <Preloader isLoading={loading} />

      <div className="max-w-5xl mx-auto space-y-8 pb-12 animate-in fade-in duration-700">
        <button
          onClick={onBack}
          className="group inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:text-[#6b2fa5] bg-white hover:bg-[#6b2fa5]/5 border border-slate-200 hover:border-[#6b2fa5]/30 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md"
        >
          <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
          Back to Select Collection
        </button>

        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-[#6b2fa5] to-purple-600 rounded-2xl shadow-lg shadow-[#6b2fa5]/30 mb-2">
            <FolderOpen className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">{collectionName}</h1>
          <p className="text-slate-600">Add or remove events in this collection</p>
        </div>

        {error && (
          <div className="flex gap-3 p-4 rounded-xl bg-red-50 border-2 border-red-200 text-red-800 text-sm">
            <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}
        {actionError && (
          <div className="flex gap-3 p-4 rounded-xl bg-red-50 border-2 border-red-200 text-red-800 text-sm">
            <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <p>{actionError}</p>
          </div>
        )}

        {!loading && (
          <div className="grid lg:grid-cols-2 gap-8">
            {/* ── Events already in the collection ── */}
            <section className="space-y-4">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                In this collection
                <span className="text-xs font-semibold text-slate-500 bg-slate-100 rounded-full px-2.5 py-1">
                  {collectionEvents.length}
                </span>
              </h2>

              {collectionEvents.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
                  No events added yet. Add one from your events on the right.
                </div>
              ) : (
                <div className="space-y-3">
                  {collectionEvents.map((event) => (
                    <div
                      key={event.eventId}
                      className="flex items-center gap-4 rounded-xl border-2 border-slate-200 bg-white p-3 shadow-sm"
                    >
                      <div className="relative w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden bg-slate-100">
                        {event.eventImage ? (
                          <Image src={event.eventImage} alt={event.eventName} fill className="object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ImageIcon className="w-6 h-6 text-slate-300" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-900 truncate">{event.eventName}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500 mt-0.5">
                          {event.eventDate && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" /> {formatDate(event.eventDate)}
                            </span>
                          )}
                          {event.eventVenue && (
                            <span className="flex items-center gap-1 truncate">
                              <MapPin className="w-3 h-3" /> {event.eventVenue}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemove(event.eventId)}
                        disabled={pendingId === event.eventId}
                        className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ── Organizer's own events, searchable ── */}
            <section className="space-y-4">
              <h2 className="text-lg font-bold text-slate-900">Your events</h2>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search your events..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border-2 border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] focus:border-[#6b2fa5] transition-all duration-200 text-sm text-slate-900 placeholder:text-slate-400"
                />
              </div>

              {filteredOwned.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
                  {ownedEvents.length === 0
                    ? "You haven't created any events yet. Create one first, then add it here."
                    : "No events match your search."}
                </div>
              ) : (
                <div className="space-y-3 max-h-[32rem] overflow-y-auto pr-1">
                  {filteredOwned.map((event) => {
                    const alreadyHere = inCollectionIds.has(event.id)
                    const inAnotherCollection = !!event.collectionId && event.collectionId !== collectionId
                    return (
                      <div
                        key={event.id}
                        className="flex items-center gap-4 rounded-xl border-2 border-slate-200 bg-white p-3 shadow-sm"
                      >
                        <div className="relative w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden bg-slate-100">
                          {event.eventImage ? (
                            <Image src={event.eventImage} alt={event.eventName} fill className="object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <ImageIcon className="w-6 h-6 text-slate-300" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-900 truncate">{event.eventName}</p>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500 mt-0.5">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" /> {formatDate(event.eventDate)}
                            </span>
                            {event.eventVenue && (
                              <span className="flex items-center gap-1 truncate">
                                <MapPin className="w-3 h-3" /> {event.eventVenue}
                              </span>
                            )}
                          </div>
                        </div>

                        {alreadyHere ? (
                          <span className="flex-shrink-0 text-xs font-semibold text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">
                            Added
                          </span>
                        ) : inAnotherCollection ? (
                          <span
                            title="This event already belongs to another collection"
                            className="flex-shrink-0 text-xs font-semibold text-slate-400 bg-slate-100 rounded-lg px-3 py-2"
                          >
                            In another collection
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleAdd(event.id)}
                            disabled={pendingId === event.id}
                            className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-[#6b2fa5] hover:bg-[#5a2589] rounded-lg transition-colors disabled:opacity-50"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Add
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </>
  )
}
