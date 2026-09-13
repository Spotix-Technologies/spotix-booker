"use client"

import { useState, useEffect } from "react"
import { authFetch } from "@/lib/auth-client"
import { ArrowLeft, Search, FolderOpen, Sparkles } from "lucide-react"
import Image from "next/image"
import { Preloader } from "@/components/preloader"

export interface EventCollection {
  id: string
  name: string
  image: string
  description: string
  eventCount: number
}

interface CollectionSelectorProps {
  onSelect: (collection: EventCollection) => void
  onBack: () => void
}

export function CollectionSelector({ onSelect, onBack }: CollectionSelectorProps) {
  const [collections, setCollections] = useState<EventCollection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [searchTerm, setSearchTerm] = useState("")

  useEffect(() => {
    const fetchCollections = async () => {
      try {
        const res = await authFetch("/api/collections")
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "Failed to load collections")
        setCollections(data.collections || [])
      } catch (err: any) {
        console.error("Error fetching collections:", err)
        setError(err.message || "Failed to load collections")
      } finally {
        setLoading(false)
      }
    }

    fetchCollections()
  }, [])

  const filteredCollections = collections.filter(
    (col) =>
      col.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      col.description.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  return (
    <>
      <Preloader isLoading={loading} />

      <div className="space-y-8 animate-in fade-in duration-700">
        {/* Back Button */}
        <button
          onClick={onBack}
          className="group inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:text-[#6b2fa5] bg-white hover:bg-[#6b2fa5]/5 border border-slate-200 hover:border-[#6b2fa5]/30 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md"
        >
          <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
          Back to Event Group Options
        </button>

        {/* Header Section */}
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-[#6b2fa5] to-purple-600 rounded-2xl shadow-lg shadow-[#6b2fa5]/30 mb-4">
            <FolderOpen className="w-8 h-8 text-white" />
          </div>

          <h1 className="text-5xl font-bold bg-gradient-to-r from-[#6b2fa5] via-[#8b3fc5] to-[#6b2fa5] bg-clip-text text-transparent">
            Manage a Collection
          </h1>

          <p className="text-lg text-slate-600">
            Choose a collection to add or remove events from
          </p>

          {/* Collection Count Badge */}
          {collections.length > 0 && (
            <div className="inline-flex items-center gap-2 bg-[#6b2fa5]/10 border border-[#6b2fa5]/20 rounded-full px-4 py-2">
              <Sparkles className="w-4 h-4 text-[#6b2fa5]" />
              <span className="text-sm font-semibold text-[#6b2fa5]">
                {collections.length} {collections.length === 1 ? 'Collection' : 'Collections'} Available
              </span>
            </div>
          )}
        </div>

        {error && (
          <div className="max-w-2xl mx-auto p-4 rounded-xl bg-red-50 border-2 border-red-200 text-red-800 text-sm text-center">
            {error}
          </div>
        )}

        {/* Search Bar */}
        <div className="max-w-2xl mx-auto animate-in fade-in slide-in-from-top-4 duration-700">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search collections by name or description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 border-2 border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] focus:border-[#6b2fa5] transition-all duration-200 shadow-sm hover:shadow-md text-slate-900 placeholder:text-slate-400"
            />
          </div>

          {/* Search Results Count */}
          {searchTerm && (
            <div className="mt-3 text-sm text-slate-600 animate-in fade-in duration-300">
              Found <span className="font-bold text-[#6b2fa5]">{filteredCollections.length}</span> {filteredCollections.length === 1 ? 'result' : 'results'}
            </div>
          )}
        </div>

        {/* Collections Grid */}
        {!loading && filteredCollections.length === 0 ? (
          <div className="max-w-md mx-auto">
            <div className="bg-gradient-to-br from-slate-50 to-purple-50/30 border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center animate-in zoom-in-95 fade-in duration-700">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-slate-100 rounded-full mb-6">
                <FolderOpen className="w-10 h-10 text-slate-400" />
              </div>

              <h3 className="text-xl font-bold text-slate-900 mb-3">
                {collections.length === 0 ? "No Collections Yet" : "No Results Found"}
              </h3>

              <p className="text-slate-600 mb-6">
                {collections.length === 0
                  ? "Create your first collection to organize your events."
                  : `No collections match "${searchTerm}". Try a different search term.`}
              </p>

              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="px-6 py-2.5 text-[#6b2fa5] hover:bg-[#6b2fa5]/10 rounded-lg font-semibold transition-colors duration-200"
                >
                  Clear Search
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto animate-in fade-in duration-700">
            {filteredCollections.map((collection) => (
              <button
                key={collection.id}
                onClick={() => onSelect(collection)}
                className="group relative overflow-hidden rounded-xl border-2 border-slate-200 bg-white hover:border-[#6b2fa5] hover:shadow-2xl hover:shadow-[#6b2fa5]/20 transition-all duration-300 hover:-translate-y-1 active:translate-y-0 text-left"
              >
                {/* Gradient accent line */}
                <div className="h-1 bg-gradient-to-r from-[#6b2fa5] via-purple-400 to-[#6b2fa5] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                {/* Collection Image */}
                {collection.image ? (
                  <div className="relative h-48 w-full overflow-hidden bg-slate-100">
                    <Image
                      src={collection.image || "/placeholder.svg"}
                      alt={collection.name}
                      fill
                      className="object-cover group-hover:scale-110 transition-transform duration-500"
                    />
                    {/* Gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  </div>
                ) : (
                  <div className="relative h-48 w-full bg-gradient-to-br from-slate-100 to-purple-50 flex items-center justify-center">
                    <FolderOpen className="w-16 h-16 text-slate-300 group-hover:text-[#6b2fa5] transition-colors duration-300" />
                  </div>
                )}

                {/* Content */}
                <div className="p-5 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-bold text-xl text-slate-900 group-hover:text-[#6b2fa5] transition-colors duration-200 line-clamp-1">
                      {collection.name}
                    </h3>
                    <span className="flex-shrink-0 text-xs font-semibold text-slate-500 bg-slate-100 rounded-full px-2.5 py-1">
                      {collection.eventCount} {collection.eventCount === 1 ? "event" : "events"}
                    </span>
                  </div>

                  {collection.description && (
                    <p className="text-sm text-slate-600 line-clamp-2 leading-relaxed">
                      {collection.description}
                    </p>
                  )}

                  {/* Select indicator */}
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#6b2fa5] opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <span>Manage Events</span>
                    <ArrowLeft className="w-4 h-4 rotate-180" />
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
