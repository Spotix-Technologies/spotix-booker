"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { auth, db } from "@/lib/firebase"
import { setDoc, doc, collection, addDoc, serverTimestamp } from "firebase/firestore"
import { Preloader } from "@/components/preloader"
import Image from "next/image"
import {
  AlertCircle,
  CheckCircle,
  MapPin,
  X,
  Upload,
  Calendar,
  Type,
  AlignLeft,
  MapPinned,
  ImageIcon,
  Sparkles,
  Repeat,
} from "lucide-react"
import { AddPricing } from "./add-pricing"
import type { TicketType } from "@/types/ticket"
import { uploadImage } from "@/lib/image-uploader"
import { MapPickerModal } from "./map-picker-modal"

interface CreateEventGroupProps {
  onSuccess?: () => void
  selectedCollection?: any | null
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

export function CreateEventGroup({ onSuccess, selectedCollection }: CreateEventGroupProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const [eventName, setEventName] = useState("")
  const [eventDescription, setEventDescription] = useState("")
  const [eventImages, setEventImages] = useState<File[]>([])
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([])
  const [frequency, setFrequency] = useState<"yearly" | "monthly" | "quarterly">("yearly")
  const [eventDate, setEventDate] = useState("")
  const [eventVenue, setEventVenue] = useState("")
  const [eventStart, setEventStart] = useState("")
  const [eventEnd, setEventEnd] = useState("")
  const [eventEndDate, setEventEndDate] = useState("")
  const [eventType, setEventType] = useState("Night party")
  const [enablePricing, setEnablePricing] = useState(false)
  const [ticketPrices, setTicketPrices] = useState<TicketType[]>([])

  const [uploadProgress, setUploadProgress] = useState<number[]>([])
  const [isUploading, setIsUploading] = useState<boolean[]>([])
  const [uploadComplete, setUploadComplete] = useState<boolean[]>([])
  const [uploadedImageUrls, setUploadedImageUrls] = useState<(string | null)[]>([])
  const cancelUploadRefs = useRef<((() => void) | null)[]>([])

  const [venueCoordinates, setVenueCoordinates] = useState<{ lat: number; lng: number } | null>(null)
  const [showMapPicker, setShowMapPicker] = useState(false)

  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const generatePayId = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    let payId = ""
    for (let i = 0; i < 8; i++) {
      payId += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return payId
  }

  useEffect(() => {
    return () => {
      cancelUploadRefs.current.forEach((cancel) => {
        if (cancel) cancel()
      })
    }
  }, [])

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
    const files = Array.from(e.dataTransfer.files).filter((file) => file.type.startsWith("image/"))
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
    const newPreviews = [...imagePreviewUrls, ...filesToAdd.map((file) => URL.createObjectURL(file))]

    setEventImages(newImages)
    setImagePreviewUrls(newPreviews)

    const startIndex = eventImages.length
    filesToAdd.forEach((file, index) => {
      startBackgroundUpload(file, startIndex + index)
    })
  }

  const startBackgroundUpload = (file: File, index: number) => {
    if (cancelUploadRefs.current[index]) {
      cancelUploadRefs.current[index]!()
      cancelUploadRefs.current[index] = null
    }

    setIsUploading((prev) => {
      const newState = [...prev]
      newState[index] = true
      return newState
    })
    setUploadProgress((prev) => {
      const newState = [...prev]
      newState[index] = 0
      return newState
    })

    const folderName = selectedCollection ? "Events" : "EventCollections"

    const { uploadPromise, cancelUpload } = uploadImage(file, {
      cloudinaryFolder: folderName,
      onProgress: (progress) => {
        setUploadProgress((prev) => {
          const newState = [...prev]
          newState[index] = progress
          return newState
        })
      },
      showAlert: false,
    })

    cancelUploadRefs.current[index] = cancelUpload

    uploadPromise
      .then(({ url, provider }) => {
        setIsUploading((prev) => {
          const newState = [...prev]
          newState[index] = false
          return newState
        })

        if (url) {
          console.log(` Image ${index + 1} uploaded successfully to`, provider)
          setUploadComplete((prev) => {
            const newState = [...prev]
            newState[index] = true
            return newState
          })
          setUploadedImageUrls((prev) => {
            const newState = [...prev]
            newState[index] = url
            return newState
          })

          setTimeout(() => {
            setUploadComplete((prev) => {
              const newState = [...prev]
              newState[index] = false
              return newState
            })
          }, 5000)
        } else {
          console.error(` Upload failed for image ${index + 1}: No URL returned`)
        }
      })
      .catch((error) => {
        console.error(` Upload failed for image ${index + 1}:`, error)
        setIsUploading((prev) => {
          const newState = [...prev]
          newState[index] = false
          return newState
        })
      })
  }

  const removeImage = (index: number) => {
    if (cancelUploadRefs.current[index]) {
      cancelUploadRefs.current[index]!()
    }

    const newImages = eventImages.filter((_, i) => i !== index)
    const newPreviews = imagePreviewUrls.filter((_, i) => i !== index)
    const newUploadedUrls = uploadedImageUrls.filter((_, i) => i !== index)
    const newProgress = uploadProgress.filter((_, i) => i !== index)
    const newUploading = isUploading.filter((_, i) => i !== index)
    const newComplete = uploadComplete.filter((_, i) => i !== index)
    cancelUploadRefs.current = cancelUploadRefs.current.filter((_, i) => i !== index)

    setEventImages(newImages)
    setImagePreviewUrls(newPreviews)
    setUploadedImageUrls(newUploadedUrls)
    setUploadProgress(newProgress)
    setIsUploading(newUploading)
    setUploadComplete(newComplete)

    URL.revokeObjectURL(imagePreviewUrls[index])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!auth.currentUser) {
      setError("You must be logged in")
      return
    }

    if (!eventName || !eventDescription) {
      setError("Please fill in all required fields")
      console.log(" Missing eventName or eventDescription")
      return
    }

    if (selectedCollection) {
      if (!eventDate || !eventVenue || !eventStart || !eventEndDate || !eventEnd) {
        setError("Please fill in all event details")
        console.log(" Missing event details for selected collection")
        return
      }
    }

    if (enablePricing && ticketPrices.length === 0) {
      setError("Please add at least one ticket type when pricing is enabled")
      return
    }

    const stillUploading = isUploading.some((uploading) => uploading)
    if (eventImages.length > 0 && stillUploading) {
      setError("Please wait for all images to finish uploading")
      return
    }

    setLoading(true)

    try {
      const user = auth.currentUser

      if (selectedCollection) {

        const eventDateTimeString = `${eventDate}T${eventStart}`
        const eventEndDateTimeString = `${eventEndDate}T${eventEnd}`

        const uploadedUrls = uploadedImageUrls.filter((url): url is string => url !== null)
        const eventImage = uploadedUrls.length > 0 ? uploadedUrls[0] : null
        const eventImagesArray = uploadedUrls.slice(1)

        const eventData = {
          eventName,
          eventDescription,
          eventImage,
          eventImages: eventImagesArray,
          eventDate: eventDateTimeString,
          eventEndDate: eventEndDateTimeString,
          eventVenue,
          venueCoordinates: venueCoordinates || null,
          eventType,
          isFree: !enablePricing,
          ticketPrices: enablePricing ? ticketPrices : [],
          createdAt: serverTimestamp(),
          createdBy: user.uid,
          status: "active",
          ticketsSold: 0,
          revenue: 0,
          collectionId: selectedCollection.id,
        }

        const eventsRef = collection(db, "events", user.uid, "userEvents")
        const docRef = await addDoc(eventsRef, eventData)

        const publicEventData = {
          imageURL: eventImage,
          eventType: eventType,
          venue: eventVenue,
          eventStartDate: eventDate,
          eventName: eventName,
          freeOrPaid:
            enablePricing && ticketPrices.length > 0 && ticketPrices.some((ticket) => ticket.policy && ticket.price),
          timestamp: serverTimestamp(),
          creatorID: user.uid,
          eventId: docRef.id,
          eventGroup: false,
        }
        await setDoc(doc(db, "publicEvents", eventName), publicEventData)

        const collectionEventsRef = collection(
          db,
          "EventCollection",
          user.uid,
          "collections",
          selectedCollection.id,
          "events",
        )
        await addDoc(collectionEventsRef, eventData)

        const payId = "PAY" + Math.random().toString(36).substring(2, 10).toUpperCase()
        const successUrl = `/create-event/success?eventId=${docRef.id}&payId=${payId}&type=one-time&eventName=${encodeURIComponent(eventName)}`
        await new Promise((resolve) => setTimeout(resolve, 500))
        router.push(successUrl)
      } else {

        const collectionPayId = generatePayId()

        const uploadedUrls = uploadedImageUrls.filter((url): url is string => url !== null)
        const collectionImage = uploadedUrls.length > 0 ? uploadedUrls[0] : ""

        const collectionData = {
          name: eventName,
          description: eventDescription,
          image: collectionImage,
          frequency,
          createdAt: serverTimestamp(),
          payId: collectionPayId,
          events: [],
        }

        const collectionRef = doc(db, "EventCollection", user.uid, "collections", eventName)
        await setDoc(collectionRef, collectionData)

        const publicCollectionRef = doc(db, "publicEvents", eventName)
        await setDoc(publicCollectionRef, {
          eventName,
          imageURL: collectionImage,
          eventGroup: true,
          createdAt: serverTimestamp(),
          createdBy: user.uid,
          frequency,
        })

        const successUrl = `/create-event/success?eventName=${encodeURIComponent(eventName)}&type=event-group`
        await new Promise((resolve) => setTimeout(resolve, 500))
        router.push(successUrl)
      }
    } catch (err: any) {
      console.error(" Error:", err)
      console.error(" Error details:", {
        message: err.message,
        code: err.code,
        stack: err.stack,
      })
      setError(err.message || "Failed to create event. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Preloader isLoading={loading} />

      <form onSubmit={handleSubmit} className="max-w-5xl mx-auto space-y-8 pb-12">
        {/* Page Header */}
        <div className="text-center space-y-4 animate-in fade-in duration-700">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-[#6b2fa5] to-purple-600 rounded-2xl shadow-lg shadow-[#6b2fa5]/30 mb-4">
            <Repeat className="w-8 h-8 text-white" />
          </div>

          <h1 className="text-5xl font-bold bg-gradient-to-r from-[#6b2fa5] via-[#8b3fc5] to-[#6b2fa5] bg-clip-text text-transparent">
            {selectedCollection ? `Add Event to ${selectedCollection.name}` : "Create Event Group"}
          </h1>

          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            {selectedCollection
              ? "Add a new event instance to your existing collection"
              : "Create a new collection for recurring events"}
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="flex gap-3 p-4 rounded-xl bg-red-50 border-2 border-red-200 shadow-sm animate-in slide-in-from-top-2 duration-300">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-red-900 mb-1">Error</p>
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          </div>
        )}

        {/* Basic Information */}
        <div className="space-y-6 rounded-xl border-2 border-slate-200 bg-white p-5 sm:p-6 lg:p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex items-center justify-center w-10 h-10 bg-[#6b2fa5]/10 rounded-lg">
              <Type className="w-5 h-5 text-[#6b2fa5]" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">
              {selectedCollection ? "Event Details" : "Collection Information"}
            </h2>
          </div>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                {selectedCollection ? "Event Name" : "Collection Name"} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder={selectedCollection ? "e.g., Summer Music Festival 2024" : "e.g., Monthly Tech Meetup"}
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                required
                className="w-full px-4 py-3 border-2 border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] focus:border-[#6b2fa5] transition-all duration-200 text-slate-900 placeholder:text-slate-400"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Description <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <AlignLeft className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                <textarea
                  placeholder="Describe your event or collection..."
                  value={eventDescription}
                  onChange={(e) => setEventDescription(e.target.value)}
                  required
                  rows={5}
                  className="w-full pl-11 pr-4 py-3 border-2 border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] focus:border-[#6b2fa5] transition-all duration-200 text-slate-900 placeholder:text-slate-400 resize-none"
                />
              </div>
            </div>

            {!selectedCollection && (
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
            )}

            {!selectedCollection && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Recurrence Frequency <span className="text-red-500">*</span>
                </label>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as "yearly" | "monthly" | "quarterly")}
                  className="w-full px-4 py-3 border-2 border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] focus:border-[#6b2fa5] transition-all duration-200 text-slate-900"
                >
                  <option value="yearly">Yearly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Event Details (only when adding to collection) */}
        {selectedCollection && (
          <>
            {/* Location */}
            <div className="space-y-6 rounded-xl border-2 border-slate-200 bg-white p-5 sm:p-6 lg:p-8 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="flex items-center justify-center w-10 h-10 bg-[#6b2fa5]/10 rounded-lg">
                  <MapPin className="w-5 h-5 text-[#6b2fa5]" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900">Location</h2>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Event Venue <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-3">
                  <div className="flex-1 relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Enter event venue or address"
                      value={eventVenue}
                      onChange={(e) => setEventVenue(e.target.value)}
                      required
                      className="w-full pl-11 pr-4 py-3 border-2 border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] focus:border-[#6b2fa5] transition-all duration-200 text-slate-900"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowMapPicker(true)}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-[#6b2fa5] hover:bg-[#5a2589] text-white font-semibold rounded-lg transition-all duration-200 shadow-sm hover:shadow-md whitespace-nowrap"
                  >
                    <MapPinned className="w-5 h-5" />
                    Pick on Map
                  </button>
                </div>
                {venueCoordinates && (
                  <p className="text-xs text-slate-600 mt-2 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3 text-emerald-600" />
                    Location coordinates saved
                  </p>
                )}
              </div>
            </div>

            {/* Date and Time */}
            <div className="space-y-6 rounded-xl border-2 border-slate-200 bg-white p-5 sm:p-6 lg:p-8 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="flex items-center justify-center w-10 h-10 bg-[#6b2fa5]/10 rounded-lg">
                  <Calendar className="w-5 h-5 text-[#6b2fa5]" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900">Date & Time</h2>
              </div>

              <div className="grid md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Start Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    required
                    className="w-full px-4 py-3 border-2 border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] focus:border-[#6b2fa5] transition-all duration-200 text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Start Time <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="time"
                    value={eventStart}
                    onChange={(e) => setEventStart(e.target.value)}
                    required
                    className="w-full px-4 py-3 border-2 border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] focus:border-[#6b2fa5] transition-all duration-200 text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    End Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={eventEndDate}
                    onChange={(e) => setEventEndDate(e.target.value)}
                    required
                    className="w-full px-4 py-3 border-2 border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] focus:border-[#6b2fa5] transition-all duration-200 text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    End Time <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="time"
                    value={eventEnd}
                    onChange={(e) => setEventEnd(e.target.value)}
                    required
                    className="w-full px-4 py-3 border-2 border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] focus:border-[#6b2fa5] transition-all duration-200 text-slate-900"
                  />
                </div>
              </div>
            </div>

            {/* Pricing */}
            <div className="rounded-xl border-2 border-slate-200 bg-white p-5 sm:p-6 lg:p-8 shadow-sm">
              <AddPricing
                enablePricing={enablePricing}
                setEnablePricing={setEnablePricing}
                ticketPrices={ticketPrices}
                setTicketPrices={setTicketPrices}
              />
            </div>
          </>
        )}

        {/* Images (only when creating new collection) */}
        {!selectedCollection && (
          <div className="space-y-6 rounded-xl border-2 border-slate-200 bg-white p-5 sm:p-6 lg:p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex items-center justify-center w-10 h-10 bg-[#6b2fa5]/10 rounded-lg">
                <ImageIcon className="w-5 h-5 text-[#6b2fa5]" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900">Collection Images</h2>
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
                  {eventImages.length === 0 ? "Upload Collection Images" : "Add More Images"}
                </p>
                <p className="text-sm text-slate-600 mb-3">Drag and drop images here, or click to select files</p>
                <div className="inline-flex items-center gap-2 bg-[#6b2fa5]/10 border border-[#6b2fa5]/20 rounded-full px-4 py-2">
                  <span className="text-xs font-semibold text-[#6b2fa5]">
                    Maximum 8 images • First image will be the main collection image • {eventImages.length}/8 uploaded
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
                          alt={`Collection image ${index + 1}`}
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
                            removeImage(index)
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
                            <p className="text-white text-sm font-semibold">{uploadProgress[index] || 0}%</p>
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
                  All images are automatically uploaded to Spotix Servers for fast, reliable hosting.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <div className="flex gap-4">
          <button
            type="submit"
            disabled={loading || isUploading.some((uploading) => uploading)}
            className="flex-1 group inline-flex items-center justify-center gap-3 px-8 py-4 bg-gradient-to-r from-[#6b2fa5] to-purple-600 hover:from-[#5a2589] hover:to-[#6b2fa5] text-white font-bold text-lg rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-[#6b2fa5]/30 hover:shadow-xl hover:shadow-[#6b2fa5]/40 hover:-translate-y-0.5 active:translate-y-0"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating...
              </>
            ) : isUploading.some((uploading) => uploading) ? (
              <>
                <Upload className="w-5 h-5 animate-pulse" />
                Uploading Images...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5 group-hover:rotate-12 transition-transform" />
                {selectedCollection ? "Add Event to Collection" : "Create Event Group"}
              </>
            )}
          </button>
        </div>
      </form>

      <MapPickerModal
        isOpen={showMapPicker}
        onClose={() => setShowMapPicker(false)}
        onSelectLocation={(address, coordinates) => {
          setEventVenue(address)
          setVenueCoordinates(coordinates)
        }}
        currentAddress={eventVenue}
      />
    </>
  )
}
