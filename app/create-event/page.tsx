"use client"

import { useState } from "react"
import { ParticlesBackground } from "@/components/particles-background"
// import { Nav } from "@/components/nav"
import { EventTypeSelector } from "@/components/create-event/event-type-selector"
import { CreateOneTimeEvent } from "@/components/create-event/create-one-time-event"
import { CreateEventGroup } from "@/components/create-event/create-event-group"
import { EventGroupLobby } from "@/components/create-event/event-group-lobby"
import { CollectionSelector } from "@/components/create-event/collection-selector"
import { ArrowLeft } from "lucide-react"

export default function CreateEventPage() {
  const [eventType, setEventType] = useState<"one-time" | "event-group" | null>(null)
  const [eventGroupStep, setEventGroupStep] = useState<"lobby" | "create" | "select" | null>(null)
  const [selectedCollection, setSelectedCollection] = useState<any>(null)

  return (
    <>
      <ParticlesBackground />
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-slate-100">
        {/* <Nav /> */}

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {!eventType ? (
            <EventTypeSelector onSelect={setEventType} />
          ) : (
            <>
              {/* Back Button */}
              <div className="mb-8 animate-in fade-in slide-in-from-left duration-500">
                <button
                  onClick={() => {
                    setEventType(null)
                    setEventGroupStep(null)
                    setSelectedCollection(null)
                  }}
                  className="group inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-slate-700 hover:text-[#6b2fa5] bg-white hover:bg-[#6b2fa5]/5 border-2 border-slate-200 hover:border-[#6b2fa5]/30 rounded-xl transition-all duration-200 shadow-sm hover:shadow-md"
                >
                  <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                  Back to Event Type Selection
                </button>
              </div>

              {/* One-Time Event */}
              {eventType === "one-time" && (
                <div className="animate-in fade-in duration-700">
                  <CreateOneTimeEvent />
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

              {/* Create New Collection */}
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
                  <CreateEventGroup selectedCollection={null} />
                </div>
              )}

              {/* Collection Selector */}
              {eventType === "event-group" && eventGroupStep === "select" && !selectedCollection && (
                <div className="animate-in fade-in duration-700">
                  <CollectionSelector
                    onSelect={(collection) => setSelectedCollection(collection)}
                    onBack={() => setEventGroupStep(null)}
                  />
                </div>
              )}

              {/* Add to Selected Collection */}
              {eventType === "event-group" && eventGroupStep === "select" && selectedCollection && (
                <div className="animate-in fade-in duration-700">
                  <div className="mb-8">
                    <button
                      onClick={() => setSelectedCollection(null)}
                      className="group inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-slate-700 hover:text-[#6b2fa5] bg-white hover:bg-[#6b2fa5]/5 border-2 border-slate-200 hover:border-[#6b2fa5]/30 rounded-xl transition-all duration-200 shadow-sm hover:shadow-md"
                    >
                      <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                      Back to Select Collection
                    </button>
                  </div>

                  {/* Selected Collection Banner */}
                  <div className="mb-8 p-6 bg-gradient-to-r from-[#6b2fa5]/10 to-purple-100/50 border-2 border-[#6b2fa5]/20 rounded-xl shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-12 h-12 bg-[#6b2fa5] rounded-xl shadow-md flex-shrink-0">
                        <span className="text-white text-xl font-bold">📁</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#6b2fa5] mb-1">Adding to Collection</p>
                        <p className="text-lg font-bold text-slate-900 truncate">{selectedCollection.name}</p>
                        {selectedCollection.description && (
                          <p className="text-sm text-slate-600 mt-1 line-clamp-1">{selectedCollection.description}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <CreateEventGroup selectedCollection={selectedCollection} />
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </>
  )
}
