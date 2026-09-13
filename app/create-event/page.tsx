"use client"

import { useState } from "react"
import { ParticlesBackground } from "@/components/particles-background"
// import { Nav } from "@/components/nav"
import { EventTypeSelector } from "@/components/create-event/event-type-selector"
import { CreateOneTimeEvent } from "@/components/create-event/create-one-time-event"
import { CreateEventGroup, type CreatedCollection } from "@/components/create-event/create-event-group"
import { EventGroupLobby } from "@/components/create-event/event-group-lobby"
import { CollectionSelector, type EventCollection } from "@/components/create-event/collection-selector"
import { ManageCollectionEvents } from "@/components/create-event/manage-collection-events"
import { ArrowLeft } from "lucide-react"
import { useUnsavedChangesWarning } from "@/hooks/useUnsavedChangesWarning"
import { UnsavedChangesDialog } from "@/components/ui/unsaved-changes-dialog"

export default function CreateEventPage() {
  const [eventType, setEventType] = useState<"one-time" | "event-group" | null>(null)
  // "create"  — creating a brand-new (empty) collection
  // "select"  — picking which existing collection to manage
  // "manage"  — adding/removing events on the collection picked in "select"
  //             (or just created in "create")
  const [eventGroupStep, setEventGroupStep] = useState<"lobby" | "create" | "select" | "manage" | null>(null)
  const [activeCollection, setActiveCollection] = useState<EventCollection | CreatedCollection | null>(null)

  // Once the organizer has moved past the type picker into an actual form,
  // treat the session as "dirty" — covers the native browser prompt for a
  // hard reload/tab close/typed URL. The in-app "Back" buttons on this page
  // are separately guarded below with the same confirm dialog.
  const isDirty = eventType !== null
  const { showConfirmDialog, confirmLeave, cancelLeave, guardNavigation } = useUnsavedChangesWarning(isDirty)

  const resetToTypeSelection = () => {
    setEventType(null)
    setEventGroupStep(null)
    setActiveCollection(null)
  }

  return (
    <>
      <ParticlesBackground />
      <UnsavedChangesDialog open={showConfirmDialog} onConfirm={confirmLeave} onCancel={cancelLeave} />
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-slate-100">
        {/* <Nav /> */}

        <main className="w-full px-3 sm:px-4 lg:px-6">
          {!eventType ? (
            <EventTypeSelector onSelect={setEventType} />
          ) : (
            <>
              {/* Back Button — for the one-time flow this now renders inside
                  CreateOneTimeEvent itself, layered over the hero image
                  (item 2), so it's skipped here to avoid a duplicate. Also
                  skipped for "manage" — ManageCollectionEvents renders its
                  own Back button (goes back to collection selection, not
                  the event-type screen). */}
              {eventType !== "one-time" && eventGroupStep !== "manage" && (
                <div className="mb-8 animate-in fade-in slide-in-from-left duration-500">
                  <button
                    onClick={() => guardNavigation(resetToTypeSelection)()}
                    className="group inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-slate-700 hover:text-[#6b2fa5] bg-white hover:bg-[#6b2fa5]/5 border-2 border-slate-200 hover:border-[#6b2fa5]/30 rounded-xl transition-all duration-200 shadow-sm hover:shadow-md"
                  >
                    <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                    Back to Event Type Selection
                  </button>
                </div>
              )}

              {/* One-Time Event */}
              {eventType === "one-time" && (
                <div className="animate-in fade-in duration-700">
                  <CreateOneTimeEvent onBack={() => guardNavigation(resetToTypeSelection)()} />
                </div>
              )}

              {/* Event Group Lobby */}
              {eventType === "event-group" && !eventGroupStep && (
                <div className="animate-in fade-in duration-700">
                  <EventGroupLobby
                    onCreateCollection={() => setEventGroupStep("create")}
                    onAddToCollection={() => setEventGroupStep("select")}
                    onBack={() => setEventType(null)}
                  />
                </div>
              )}

              {/* Create New Collection — a pure container (name/description/
                  image). Landing straight in "manage" afterwards lets the
                  organizer immediately start attaching events to it. */}
              {eventType === "event-group" && eventGroupStep === "create" && (
                <div className="animate-in fade-in duration-700">
                  <div className="mb-8">
                    <button
                      onClick={() => setEventGroupStep(null)}
                      className="group inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-slate-700 hover:text-[#6b2fa5] bg-white hover:bg-[#6b2fa5]/5 border-2 border-slate-200 hover:border-[#6b2fa5]/30 rounded-xl transition-all duration-200 shadow-sm hover:shadow-md"
                    >
                      <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                      Back to Event Group Options
                    </button>
                  </div>
                  <CreateEventGroup
                    onCreated={(collection) => {
                      setActiveCollection(collection)
                      setEventGroupStep("manage")
                    }}
                  />
                </div>
              )}

              {/* Collection Selector */}
              {eventType === "event-group" && eventGroupStep === "select" && (
                <div className="animate-in fade-in duration-700">
                  <CollectionSelector
                    onSelect={(collection) => {
                      setActiveCollection(collection)
                      setEventGroupStep("manage")
                    }}
                    onBack={() => setEventGroupStep(null)}
                  />
                </div>
              )}

              {/* Manage Collection Events — add/remove already-created
                  events on the selected (or just-created) collection. */}
              {eventType === "event-group" && eventGroupStep === "manage" && activeCollection && (
                <div className="animate-in fade-in duration-700">
                  <ManageCollectionEvents
                    collectionId={activeCollection.id}
                    collectionName={activeCollection.name}
                    onBack={() => {
                      setActiveCollection(null)
                      setEventGroupStep("select")
                    }}
                  />
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </>
  )
}
