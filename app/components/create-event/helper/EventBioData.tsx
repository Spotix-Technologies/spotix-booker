import React, { useRef, useState } from "react"
import Image from "next/image"
import {
  Type,
  AlignLeft,
  Image as ImageLucide,
  Upload,
  X,
  CheckCircle,
  AlertCircle,
  Link2,
  Loader2,
  Pencil,
} from "lucide-react"

export type SlugStatus = "idle" | "checking" | "available" | "taken" | "invalid"

interface EventBioDataProps {
  eventName: string
  setEventName: (value: string) => void
  eventDescription: string
  setEventDescription: (value: string) => void
  eventType: string
  setEventType: (value: string) => void
  /** Item 5 — shareable event link. eventId stays the internal Firestore
   *  doc id; this is purely the human-editable public-URL segment. */
  eventSlug?: string
  onEventSlugChange?: (value: string) => void
  slugStatus?: SlugStatus
  /** e.g. "https://spotix.com" — from NEXT_PUBLIC_SPOTIX_USER. Shown as the
   *  read-only prefix in front of the editable slug segment. */
  spotixUserBase?: string
  eventImages: File[]
  setEventImages: (files: File[]) => void
  imagePreviewUrls: string[]
  setImagePreviewUrls: (urls: string[]) => void
  uploadProgress: number[]
  setUploadProgress: (progress: number[]) => void
  isUploading: boolean[]
  setIsUploading: (uploading: boolean[]) => void
  uploadComplete: boolean[]
  setUploadComplete: (complete: boolean[]) => void
  uploadedImageUrls: (string | null)[]
  setUploadedImageUrls: (urls: (string | null)[]) => void
  onStartUpload: (file: File, index: number) => void
  onRemoveImage: (index: number) => void
}

const eventTypes = [
  "Night party",
  "Concert",
  "Conference",
  "Workshop",
  "Seminar",
  "Wedding",
  "Birthday",
  "Corporate Event",
  "Sports Event",
  "Festival",
]

export function EventBioData({
  eventName,
  setEventName,
  eventDescription,
  setEventDescription,
  eventType,
  setEventType,
  eventSlug = "",
  onEventSlugChange,
  slugStatus = "idle",
  spotixUserBase = "",
  eventImages,
  setEventImages,
  imagePreviewUrls,
  setImagePreviewUrls,
  uploadProgress,
  isUploading,
  uploadComplete,
  onStartUpload,
  onRemoveImage,
}: EventBioDataProps) {
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    handleFiles(Array.from(files))
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const files = Array.from(e.dataTransfer.files).filter((file) =>
      file.type.startsWith("image/")
    )
    if (files.length > 0) {
      handleFiles(files)
    }
  }

  const handleFiles = (files: File[]) => {
    const remainingSlots = 8 - eventImages.length
    if (remainingSlots <= 0) {
      alert("Maximum 8 images allowed")
      return
    }

    const filesToAdd = files.slice(0, remainingSlots)
    const newImages = [...eventImages, ...filesToAdd]
    const newPreviews = [
      ...imagePreviewUrls,
      ...filesToAdd.map((file) => URL.createObjectURL(file)),
    ]

    setEventImages(newImages)
    setImagePreviewUrls(newPreviews)

    const startIndex = eventImages.length
    filesToAdd.forEach((file, index) => {
      onStartUpload(file, startIndex + index)
    })
  }

  return (
    <div className="space-y-8">
      {/* Basic Information */}
      <div className="space-y-6 rounded-xl border-2 border-slate-200 bg-white p-5 sm:p-6 lg:p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex items-center justify-center w-10 h-10 bg-[#6b2fa5]/10 rounded-lg">
            <Type className="w-5 h-5 text-[#6b2fa5]" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Basic Information</h2>
        </div>

        <div className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Event Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g., Summer Music Festival 2024"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              required
              className="w-full px-4 py-3 border-2 border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] focus:border-[#6b2fa5] transition-all duration-200 text-slate-900 placeholder:text-slate-400"
            />
          </div>

          {/* Shareable event link — item 5. Auto-fills from the event name
              until the organizer edits it directly. */}
          {onEventSlugChange && (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                <Link2 className="w-4 h-4 text-slate-400" />
                Your sharable event link
              </label>
              <div className="flex items-stretch rounded-lg border-2 border-slate-200 focus-within:ring-2 focus-within:ring-[#6b2fa5] focus-within:border-[#6b2fa5] overflow-hidden bg-white">
                <span className="hidden sm:flex items-center px-3 bg-slate-50 border-r border-slate-200 text-xs text-slate-500 whitespace-nowrap">
                  {(spotixUserBase || "spotix.com").replace(/^https?:\/\//, "")}/event/
                </span>
                <div className="relative flex-1">
                  <Pencil className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="your-event-name"
                    value={eventSlug}
                    onChange={(e) => onEventSlugChange(e.target.value)}
                    className="w-full pl-9 pr-9 py-3 text-slate-900 placeholder:text-slate-400 outline-none"
                  />
                  {slugStatus === "checking" && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
                  )}
                  {slugStatus === "available" && (
                    <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />
                  )}
                  {(slugStatus === "taken" || slugStatus === "invalid") && (
                    <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500" />
                  )}
                </div>
              </div>
              <p className={`text-xs mt-1.5 ${slugStatus === "taken" || slugStatus === "invalid" ? "text-red-600" : "text-slate-500"}`}>
                {slugStatus === "taken" && "That link is already taken — try something else."}
                {slugStatus === "invalid" && "3–60 characters, lowercase letters, numbers, and hyphens only."}
                {(slugStatus === "idle" || slugStatus === "checking" || slugStatus === "available") &&
                  "Edit freely — this is what attendees will see and share. Old links keep working either way."}
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Event Description <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <AlignLeft className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
              <textarea
                placeholder="Describe your event in detail..."
                value={eventDescription}
                onChange={(e) => setEventDescription(e.target.value)}
                required
                rows={5}
                className="w-full pl-11 pr-4 py-3 border-2 border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] focus:border-[#6b2fa5] transition-all duration-200 text-slate-900 placeholder:text-slate-400 resize-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Event Type <span className="text-red-500">*</span>
            </label>
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              className="w-full px-4 py-3 border-2 border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] focus:border-[#6b2fa5] transition-all duration-200 text-slate-900"
            >
              {eventTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Event Images */}
      <div className="space-y-6 rounded-xl border-2 border-slate-200 bg-white p-5 sm:p-6 lg:p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex items-center justify-center w-10 h-10 bg-[#6b2fa5]/10 rounded-lg">
            <ImageLucide className="w-5 h-5 text-[#6b2fa5]" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Event Images</h2>
        </div>

        <div className="space-y-5">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 sm:p-8 lg:p-12 text-center cursor-pointer transition-all duration-300 ${
              isDragging
                ? "border-[#6b2fa5] bg-[#6b2fa5]/5 scale-[1.02]"
                : "border-slate-300 hover:border-[#6b2fa5] hover:bg-slate-50"
            }`}
          >
            <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-2xl mb-4">
              <Upload className="h-8 w-8 text-slate-400" />
            </div>
            <p className="text-lg font-bold text-slate-900 mb-2">
              {eventImages.length === 0 ? "Upload Event Images" : "Add More Images"}
            </p>
            <p className="text-sm text-slate-600 mb-3">
              Drag and drop images here, or click to select files
            </p>
            <div className="inline-flex items-center gap-2 bg-[#6b2fa5]/10 border border-[#6b2fa5]/20 rounded-full px-4 py-2">
              <span className="text-xs font-semibold text-[#6b2fa5]">
                Maximum 8 images • First image will be the main event image •{" "}
                {eventImages.length}/8 uploaded
              </span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageChange}
              className="hidden"
            />
          </div>

          {imagePreviewUrls.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {imagePreviewUrls.map((url, index) => (
                <div key={index} className="relative group">
                  <div className="relative w-full h-44 rounded-xl overflow-hidden border-2 border-slate-200 group-hover:border-[#6b2fa5] transition-all duration-300">
                    <Image
                      src={url || "/placeholder.svg"}
                      alt={`Event image ${index + 1}`}
                      fill
                      className="object-cover group-hover:scale-110 transition-transform duration-500"
                    />

                    {index === 0 && (
                      <div className="absolute top-3 left-3 bg-gradient-to-r from-[#6b2fa5] to-purple-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-md">
                        Main Image
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onRemoveImage(index)
                      }}
                      className="absolute top-3 right-3 bg-red-500 hover:bg-red-600 text-white p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200 shadow-md hover:scale-110"
                    >
                      <X className="h-4 w-4" />
                    </button>

                    {isUploading[index] && (
                      <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center backdrop-blur-sm">
                        <div className="w-3/4 h-2.5 bg-slate-700 rounded-full overflow-hidden mb-2">
                          <div
                            className="h-full bg-gradient-to-r from-[#6b2fa5] to-purple-500 transition-all duration-300"
                            style={{ width: `${uploadProgress[index] || 0}%` }}
                          />
                        </div>
                        <p className="text-white text-sm font-semibold">
                          {uploadProgress[index] || 0}%
                        </p>
                      </div>
                    )}

                    {uploadComplete[index] && (
                      <div className="absolute inset-0 bg-emerald-500/30 backdrop-blur-sm flex items-center justify-center">
                        <div className="bg-emerald-500 rounded-full p-3">
                          <CheckCircle className="h-8 w-8 text-white" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-start gap-2 p-4 rounded-lg bg-blue-50 border border-blue-200">
            <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-800">
              All images are automatically uploaded to Spotix Servers for fast, reliable
              hosting.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}