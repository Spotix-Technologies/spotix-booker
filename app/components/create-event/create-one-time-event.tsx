"use client"

import type React from "react"
import { useState, useRef, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Preloader } from "@/components/preloader"
import { AddPricing } from "./add-pricing"
import { AlertCircle, CheckCircle, Save, FolderOpen, Loader2, ArrowLeft } from "lucide-react"
import { uploadImage } from "@/lib/image-uploader"
import { authFetch, getAccessToken } from "@/lib/auth-client"
import { MapPickerModal } from "./map-picker-modal"
import type { TicketType } from "@/types/ticket"
import { slugify, slugifyLive, isValidSlug } from "@/lib/slug"
import { useEventDraft } from "@/hooks/useEventDraft"
import type { FeeBurdenState } from "./helper/BurdenOfFeeCard"
import type { SlugStatus } from "./helper/EventBioData"

// Import helper components
import { EventBioData } from "./helper/EventBioData"
import { EventLocation } from "./helper/EventLocation"
import { EventDateTime } from "./helper/EventDateTime"
import { AdditionalSettings } from "./helper/AdditionalSettings"
import { Affiliates } from "./helper/Affiliates"
import { FormNavigation } from "./helper/FormNavigation"

// Public base URL of spotix-user, used to build the shareable event link
// shown live as the organizer types their event name/slug (item 5). Needs
// the NEXT_PUBLIC_ prefix since it's read in the browser, not just at
// build/SSR time — set it in .env: NEXT_PUBLIC_SPOTIX_USER=https://spotix.com
const SPOTIX_USER_BASE = process.env.NEXT_PUBLIC_SPOTIX_USER || ""

/** Per-tab background image, bleeding from the very top of the page down
 *  to just above the step content card (item 8). Blurred + dark overlay so
 *  the header text stays readable on top of it while the card underneath
 *  stays fully legible on its own white background.
 *
 *  Full-bleed to the actual screen edges (item 2) via the left-1/2 +
 *  -translate-x-1/2 + w-screen trick, which escapes whatever horizontal
 *  padding its ancestors (main, this component's own wrapper) apply —
 *  inset-x-0 alone only reaches the edges of the nearest padded box, which
 *  is what was giving it that boxed-in, sharp-edged look. The overlay
 *  stays black the whole way down (just less opaque near the bottom) so
 *  the photo never reads as washed-out/white behind the header text,
 *  while still blending into the page background below it (item 2). */
function CreateEventBackdrop() {
  return (
    <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 w-screen top-0 h-[420px] -z-10 overflow-hidden">
      <Image
        src="/create-event-bg.jpg"
        alt=""
        fill
        priority
        className="object-cover object-center blur-[2px] scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/90 via-black/75 to-black/60" />
    </div>
  )
}

interface CreateOneTimeEventProps {
  onSuccess?: () => void
  /** Renders the "Back to Event Type Selection" control inside the hero
   *  image instead of the caller doing it above the component (item 2). */
  onBack?: () => void
}

export function CreateOneTimeEvent({ onSuccess, onBack }: CreateOneTimeEventProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [apiWarnings, setApiWarnings] = useState<string[]>([])
  const [currentStep, setCurrentStep] = useState(1)
  const totalSteps = 6

  // Form states
  const [eventName, setEventName] = useState("")
  const [eventDescription, setEventDescription] = useState("")
  const [eventImages, setEventImages] = useState<File[]>([])
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([])
  const [eventDate, setEventDate] = useState("")
  const [eventVenue, setEventVenue] = useState("")
  const [eventStart, setEventStart] = useState("")
  const [eventEnd, setEventEnd] = useState("")
  const [eventEndDate, setEventEndDate] = useState("")
  const [eventType, setEventType] = useState("Night party")
  const [enablePricing, setEnablePricing] = useState(false)
  const [ticketPrices, setTicketPrices] = useState<TicketType[]>([])
  const [enableStopDate, setEnableStopDate] = useState(false)
  const [stopDate, setStopDate] = useState("")
  const [feeBurden, setFeeBurden] = useState<FeeBurdenState>({ coversPaystackFee: false, coversSpotixFee: false })

  // Shareable event link (item 5) — auto-derives from eventName until the
  // organizer edits the slug field directly, at which point it's theirs to
  // control. eventId (assigned by Firestore on create) stays the internal
  // key everywhere else; this is purely the public URL segment.
  const [eventSlug, setEventSlug] = useState("")
  const [slugTouched, setSlugTouched] = useState(false)
  const [slugStatus, setSlugStatus] = useState<SlugStatus>("idle")
  const slugCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [enabledCollaboration, setEnabledCollaboration] = useState(false)
  const [allowAgents, setAllowAgents] = useState(false)
  const [verifiedAffiliate, setVerifiedAffiliate] = useState<{
    id: string
    name: string
  } | null>(null)

  // Upload states
  const [uploadProgress, setUploadProgress] = useState<number[]>([])
  const [isUploading, setIsUploading] = useState<boolean[]>([])
  const [uploadComplete, setUploadComplete] = useState<boolean[]>([])
  const [uploadedImageUrls, setUploadedImageUrls] = useState<(string | null)[]>([])
  const cancelUploadRefs = useRef<((() => void) | null)[]>([])

  const [venueCoordinates, setVenueCoordinates] = useState<{
    lat: number
    lng: number
  } | null>(null)
  const [showMapPicker, setShowMapPicker] = useState(false)
  const [country, setCountry] = useState("")
  const [state, setState] = useState("")

  useEffect(() => {
    return () => {
      cancelUploadRefs.current.forEach((cancel) => {
        if (cancel) cancel()
      })
    }
  }, [])

  // Auto-derive the slug from the event name until the organizer edits it
  // themselves (item 5).
  useEffect(() => {
    if (!slugTouched) {
      setEventSlug(slugifyLive(eventName))
    }
  }, [eventName, slugTouched])

  // Uses slugifyLive (not the strict `slugify`) so a space typed at the
  // end of the field becomes a hyphen instead of being silently eaten —
  // see the comment on slugifyLive in lib/slug.ts.
  const handleEventSlugChange = useCallback((value: string) => {
    setSlugTouched(true)
    setEventSlug(slugifyLive(value))
  }, [])

  // Debounced live availability check against /api/event/slug-check.
  useEffect(() => {
    if (slugCheckTimer.current) clearTimeout(slugCheckTimer.current)
    if (!eventSlug) {
      setSlugStatus("idle")
      return
    }
    if (!isValidSlug(eventSlug)) {
      setSlugStatus("invalid")
      return
    }
    setSlugStatus("checking")
    slugCheckTimer.current = setTimeout(async () => {
      try {
        const res = await authFetch(`/api/event/slug-check?slug=${encodeURIComponent(eventSlug)}`)
        const json = await res.json()
        setSlugStatus(json.available ? "available" : "taken")
      } catch {
        setSlugStatus("idle")
      }
    }, 500)
    return () => {
      if (slugCheckTimer.current) clearTimeout(slugCheckTimer.current)
    }
  }, [eventSlug])

  // ── Redis draft (item 4) ────────────────────────────────────────────────
  const buildDraftSnapshot = useCallback(
    () => ({
      eventName, eventDescription, eventDate, eventVenue, eventStart, eventEnd,
      eventEndDate, eventType, enablePricing, ticketPrices, enableStopDate, stopDate,
      feeBurden, enabledCollaboration, allowAgents, verifiedAffiliate, venueCoordinates,
      country, state,
      eventSlug, slugTouched, currentStep,
      // File objects can't survive JSON — uploaded images have to be re-added
      // after restoring a draft; already-uploaded URLs are kept so nothing
      // already-uploaded is silently lost.
      uploadedImageUrls,
    }),
    [
      eventName, eventDescription, eventDate, eventVenue, eventStart, eventEnd,
      eventEndDate, eventType, enablePricing, ticketPrices, enableStopDate, stopDate,
      feeBurden, enabledCollaboration, allowAgents, verifiedAffiliate, venueCoordinates,
      country, state,
      eventSlug, slugTouched, currentStep, uploadedImageUrls,
    ]
  )

  const applyDraftSnapshot = useCallback((data: any) => {
    if (!data) return
    setEventName(data.eventName || "")
    setEventDescription(data.eventDescription || "")
    setEventDate(data.eventDate || "")
    setEventVenue(data.eventVenue || "")
    setEventStart(data.eventStart || "")
    setEventEnd(data.eventEnd || "")
    setEventEndDate(data.eventEndDate || "")
    setEventType(data.eventType || "Night party")
    setEnablePricing(!!data.enablePricing)
    setTicketPrices(Array.isArray(data.ticketPrices) ? data.ticketPrices : [])
    setEnableStopDate(!!data.enableStopDate)
    setStopDate(data.stopDate || "")
    setFeeBurden(data.feeBurden || { coversPaystackFee: false, coversSpotixFee: false })
    setEnabledCollaboration(!!data.enabledCollaboration)
    setAllowAgents(!!data.allowAgents)
    setVerifiedAffiliate(data.verifiedAffiliate || null)
    setVenueCoordinates(data.venueCoordinates || null)
    setCountry(data.country || "")
    setState(data.state || "")
    setSlugTouched(!!data.slugTouched)
    setEventSlug(data.eventSlug || "")
    setUploadedImageUrls(Array.isArray(data.uploadedImageUrls) ? data.uploadedImageUrls : [])
    if (typeof data.currentStep === "number") setCurrentStep(data.currentStep)
  }, [])

  // "Has entries worth protecting" — drives both the Save button's enabled
  // state and the native browser unload prompt below.
  const hasContent =
    !!eventName.trim() || !!eventDescription.trim() || !!eventVenue.trim() || !!eventDate || ticketPrices.length > 0

  // Tracks whether the form has changed since the last successful save —
  // resets on every save (autosave included) and every load, so the
  // native "leave site?" prompt only fires "till they save draft", not
  // forever once dirty. State updates from a load land asynchronously, so
  // that path just flags "sync on the next render" instead of trying to
  // read fresh state synchronously.
  const lastSavedSnapshotRef = useRef<string>("")
  const currentSnapshotJson = JSON.stringify(buildDraftSnapshot())
  const isUnsavedSinceLastSave = hasContent && currentSnapshotJson !== lastSavedSnapshotRef.current
  const syncOnNextRenderRef = useRef(false)

  const { isSaving: isSavingDraft, isLoading: isLoadingDraft, hasDraft, saveDraft, loadDraft, clearDraft } =
    useEventDraft({
      getSnapshot: buildDraftSnapshot,
      applySnapshot: applyDraftSnapshot,
      isDirty: hasContent,
      onSaved: () => {
        lastSavedSnapshotRef.current = currentSnapshotJson
      },
    })

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!isUnsavedSinceLastSave) return
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [isUnsavedSinceLastSave])

  const handleSaveDraft = () => saveDraft()

  const handleLoadDraft = async () => {
    const success = await loadDraft()
    if (success) syncOnNextRenderRef.current = true
  }

  useEffect(() => {
    if (syncOnNextRenderRef.current) {
      lastSavedSnapshotRef.current = currentSnapshotJson
      syncOnNextRenderRef.current = false
    }
  }, [currentSnapshotJson])

  // Validation: Get minimum date (current date + 2 days)
  const getMinDate = () => {
    const today = new Date()
    const minDate = new Date(today)
    minDate.setDate(today.getDate() + 2)
    return minDate.toISOString().split("T")[0]
  }

  // Validation: Get max stop date (event start date - 3 days)
  const getMaxStopDate = () => {
    if (!eventDate) return ""
    const eventStartDate = new Date(eventDate)
    const maxStopDate = new Date(eventStartDate)
    maxStopDate.setDate(eventStartDate.getDate() - 3)
    return maxStopDate.toISOString().split("T")[0]
  }

  // Validation: Check if end date/time is valid
  const validateEndDateTime = () => {
    if (!eventDate || !eventStart || !eventEndDate || !eventEnd) return true

    const startDateTime = new Date(`${eventDate}T${eventStart}`)
    const endDateTime = new Date(`${eventEndDate}T${eventEnd}`)

    return endDateTime > startDateTime
  }

  // Validation: Check if stop date is valid
  const validateStopDate = () => {
    if (!enableStopDate || !stopDate || !eventDate) return true

    const eventStartDate = new Date(eventDate)
    const stopDateTime = new Date(stopDate)
    const maxStopDate = new Date(eventStartDate)
    maxStopDate.setDate(eventStartDate.getDate() - 3)

    return stopDateTime <= maxStopDate && stopDateTime < eventStartDate
  }

  // Auto-clear end date/time when start date/time changes
  useEffect(() => {
    if (!eventDate || !eventStart) {
      setEventEndDate("")
      setEventEnd("")
    }
  }, [eventDate, eventStart])

  // Auto-adjust stop date if it becomes invalid
  useEffect(() => {
    if (enableStopDate && stopDate && eventDate) {
      const eventStartDate = new Date(eventDate)
      const stopDateTime = new Date(stopDate)
      const maxStopDate = new Date(eventStartDate)
      maxStopDate.setDate(eventStartDate.getDate() - 3)

      if (stopDateTime > maxStopDate) {
        setStopDate("")
      }
    }
  }, [eventDate, stopDate, enableStopDate])

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

    const { uploadPromise, cancelUpload } = uploadImage(file, {
      cloudinaryFolder: "Events",
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
          console.log(`✅ Image ${index + 1} uploaded successfully to`, provider)
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
          console.error(`❌ Upload failed for image ${index + 1}: No URL returned`)
        }
      })
      .catch((error) => {
        console.error(`❌ Upload failed for image ${index + 1}:`, error)
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

  // Step validation
  const canProceedToNextStep = () => {
    switch (currentStep) {
      case 1:
        return !!eventName && !!eventDescription && !!eventType
      case 2:
        return !!eventVenue && !!country && !!state
      case 3:
        return !!eventDate && !!eventStart && !!eventEndDate && !!eventEnd && validateEndDateTime()
      case 4:
        return (!enablePricing || ticketPrices.length > 0) && (!enableStopDate || !stopDate || validateStopDate())
      case 5:
        return true
      case 6:
        return true
      default:
        return false
    }
  }

  const handleNext = () => {
    if (canProceedToNextStep()) {
      setCurrentStep((prev) => Math.min(prev + 1, totalSteps))
      setError("")
    }
  }

  const handlePrevious = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1))
    setError("")
    setApiWarnings([])
  }

  const handleSubmit = async () => {
    setError("")
    setApiWarnings([])
    console.log("📝 Form submitted - starting validation")

    // NOTE: this app doesn't use the Firebase client SDK for session state —
    // login is a server-side REST call (see app/api/auth/login/route.ts) that
    // issues our own JWT, so `auth.currentUser` here is always null and this
    // guard used to reject every submission even when the user was properly
    // logged in. The real session lives in the in-memory access token /
    // spotix_at cookie managed by lib/auth-client.ts — check that instead,
    // same as useProtectedPage() does for every other protected page.
    if (!getAccessToken()) {
      setError("You must be logged in to create an event")
      return
    }

    // Step 1 & 3 validation
    if (!eventName || !eventDate || !eventVenue || !country || !state || !eventStart || !eventEndDate || !eventEnd) {
      const missingFields = []
      if (!eventName) missingFields.push("event name (Step 1)")
      if (!eventVenue) missingFields.push("venue (Step 2)")
      if (!country) missingFields.push("country (Step 2)")
      if (!state) missingFields.push("state (Step 2)")
      if (!eventDate || !eventStart || !eventEndDate || !eventEnd) missingFields.push("date/time (Step 3)")
      
      setError(`Missing required fields: ${missingFields.join(", ")}`)
      return
    }

    // Step 3 validation - Date/Time
    if (!validateEndDateTime()) {
      setError("Step 3: Event end date and time must be after the start date and time")
      return
    }

    // Pricing tab validation - Stop Date (moved here from the old
    // Additional Settings step — see item 6)
    if (enableStopDate && stopDate) {
      if (!validateStopDate()) {
        setError("Pricing: Stop date must be at least 3 days before the event start date")
        return
      }
    }

    // Step 4 validation - Pricing
    if (enablePricing && ticketPrices.length === 0) {
      setError("Step 4: Please add at least one ticket type when pricing is enabled")
      return
    }

    if (enablePricing) {
      // Check if all tickets have required fields (policy name is required, price can be 0 for free tickets)
      const hasInvalidTicket = ticketPrices.some((ticket) => !ticket.policy || ticket.price === undefined || ticket.price === "")
      if (hasInvalidTicket) {
        setError("Step 4: Fix pricing details properly - each ticket must have a name and price (use 0 for free tickets)")
        return
      }

      // Validate that there's at least one ticket with a name
      const hasValidTicket = ticketPrices.some((ticket) => ticket.policy && ticket.policy.trim() !== "")
      if (!hasValidTicket) {
        setError("Step 4: Fix pricing details properly - at least one ticket must have a valid name")
        return
      }
    }

    const allUploadsComplete = uploadedImageUrls.every((url) => url !== null)
    const stillUploading = isUploading.some((uploading) => uploading)

    if (eventImages.length > 0 && (!allUploadsComplete || stillUploading)) {
      setError("Step 1: Please wait for all images to finish uploading")
      return
    }

    setLoading(true)

    try {
      console.log("🚀 Creating event via API with data:", {
        eventName,
        eventDate,
        eventStart,
        eventEndDate,
        eventEnd,
      })

      const uploadedUrls = uploadedImageUrls.filter((url): url is string => url !== null)

      // Prepare the request body for the API
      // Note: no userId field — /api/event/one derives the organizer id from
      // the verified access token server-side (see resolveIdentity() there),
      // it never reads it from the body.
      const requestBody = {
        eventName,
        eventSlug: eventSlug || undefined,
        eventDescription,
        eventImages: uploadedUrls,
        eventDate,
        eventVenue,
        venueCoordinates: venueCoordinates || null,
        country,
        state,
        eventStart,
        eventEnd,
        eventEndDate,
        eventType,
        enablePricing,
        ticketPrices: enablePricing ? ticketPrices : [],
        feeBurden,
        enableStopDate,
        stopDate: enableStopDate && stopDate ? stopDate : null,
        enabledCollaboration,
        allowAgents: enabledCollaboration ? allowAgents : false,
        affiliateId: verifiedAffiliate ? verifiedAffiliate.id : null,
        affiliateName: verifiedAffiliate ? verifiedAffiliate.name : null,
      }

      console.log("📤 Sending request to API...")

      // Call the API endpoint
      // NOTE: this must go through authFetch (not plain fetch) — it attaches
      // the in-memory access token as an Authorization header and silently
      // refreshes + retries on a 401. A long, multi-step create-event session
      // easily outlasts the 15-minute access token cookie; without authFetch
      // this call would 401 with "you must be logged in" even though the
      // user's session is still perfectly valid.
      const response = await authFetch("/api/event/one", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      })

      const data = await response.json()

      if (!response.ok) {
        // Handle API errors
        console.error("❌ API Error:", data)
        throw new Error(data.message || "Failed to create event")
      }

      console.log("✅ Event created successfully:", data)

      // Show warnings if any
      if (data.warnings && data.warnings.length > 0) {
        setApiWarnings(data.warnings)
        console.warn("⚠️ API Warnings:", data.warnings)
      }

      // Generate success URL with payId
      const payId = "PAY" + Math.random().toString(36).substring(2, 10).toUpperCase()
      // Pass the slug through too (item 3) — falls back to whatever the API
      // persisted (data.slug / data.eventSlug) in case it normalized the one
      // the organizer typed, then to the local form value.
      const finalSlug = data.slug || data.eventSlug || eventSlug || ""
      const successUrl = `/create-event/success?eventId=${data.eventId}&payId=${payId}&type=one-time&eventName=${encodeURIComponent(eventName)}${finalSlug ? `&slug=${encodeURIComponent(finalSlug)}` : ""}`

      console.log("🎉 Event created successfully, redirecting to:", successUrl)

      // The event is safely persisted now — clear the Redis draft so it
      // doesn't hang around offering to "restore" an event that already
      // exists.
      clearDraft()

      // Small delay to ensure everything is processed
      await new Promise((resolve) => setTimeout(resolve, 500))
      
      // Redirect to success page
      router.push(successUrl)

      // Call onSuccess callback if provided
      if (onSuccess) {
        onSuccess()
      }
    } catch (err: any) {
      console.error("❌ Error creating event:", err)
      console.error("❌ Error details:", {
        message: err.message,
        stack: err.stack,
      })
      setError(err.message || "Failed to create event. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <EventBioData
            eventName={eventName}
            setEventName={setEventName}
            eventDescription={eventDescription}
            setEventDescription={setEventDescription}
            eventType={eventType}
            setEventType={setEventType}
            eventImages={eventImages}
            setEventImages={setEventImages}
            imagePreviewUrls={imagePreviewUrls}
            setImagePreviewUrls={setImagePreviewUrls}
            uploadProgress={uploadProgress}
            setUploadProgress={setUploadProgress}
            isUploading={isUploading}
            setIsUploading={setIsUploading}
            uploadComplete={uploadComplete}
            setUploadComplete={setUploadComplete}
            uploadedImageUrls={uploadedImageUrls}
            setUploadedImageUrls={setUploadedImageUrls}
            onStartUpload={startBackgroundUpload}
            onRemoveImage={removeImage}
            eventSlug={eventSlug}
            onEventSlugChange={handleEventSlugChange}
            slugStatus={slugStatus}
            spotixUserBase={SPOTIX_USER_BASE}
          />
        )
      case 2:
        return (
          <EventLocation
            eventVenue={eventVenue}
            setEventVenue={setEventVenue}
            venueCoordinates={venueCoordinates}
            setVenueCoordinates={setVenueCoordinates}
            country={country}
            setCountry={setCountry}
            state={state}
            setState={setState}
            onOpenMapPicker={() => setShowMapPicker(true)}
          />
        )
      case 3:
        return (
          <EventDateTime
            eventDate={eventDate}
            setEventDate={setEventDate}
            eventStart={eventStart}
            setEventStart={setEventStart}
            eventEndDate={eventEndDate}
            setEventEndDate={setEventEndDate}
            eventEnd={eventEnd}
            setEventEnd={setEventEnd}
            getMinDate={getMinDate}
            validateEndDateTime={validateEndDateTime}
          />
        )
      case 4:
        return (
          <div className="rounded-xl border-2 border-slate-200 bg-white p-5 sm:p-6 lg:p-8 shadow-sm">
            <AddPricing
              enablePricing={enablePricing}
              setEnablePricing={setEnablePricing}
              ticketPrices={ticketPrices}
              setTicketPrices={setTicketPrices}
              feeBurden={feeBurden}
              setFeeBurden={setFeeBurden}
              enableStopDate={enableStopDate}
              setEnableStopDate={setEnableStopDate}
              stopDate={stopDate}
              setStopDate={setStopDate}
              eventDate={eventDate}
              getMaxStopDate={getMaxStopDate}
              validateStopDate={validateStopDate}
            />
          </div>
        )
      case 5:
        return (
          <AdditionalSettings
            enabledCollaboration={enabledCollaboration}
            setEnabledCollaboration={setEnabledCollaboration}
            allowAgents={allowAgents}
            setAllowAgents={setAllowAgents}
          />
        )
      case 6:
        return (
          <Affiliates
            verifiedAffiliate={verifiedAffiliate}
            setVerifiedAffiliate={setVerifiedAffiliate}
          />
        )
      default:
        return null
    }
  }

  return (
    <>
      <Preloader isLoading={loading} />

      <div className="relative w-full px-0 sm:px-4 lg:px-6 xl:px-8 py-12 space-y-8 pb-12">
        <CreateEventBackdrop />

        {/* Top toolbar — Back (item 2) on the left, Save / Load Draft on the
            right, both floating over the hero image instead of the back
            button living above it on a plain background. */}
        <div className="flex justify-between items-center gap-2 px-4 sm:px-0 animate-in fade-in duration-500">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="group inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-white/15 hover:bg-white/25 border-2 border-white/30 hover:border-white/50 rounded-xl backdrop-blur-md transition-all duration-200 shadow-sm"
            >
              <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
              Back to Event Type Selection
            </button>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2">
            {hasDraft && (
              <button
                type="button"
                onClick={handleLoadDraft}
                disabled={isLoadingDraft}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/90 backdrop-blur border-2 border-slate-200 text-sm font-semibold text-slate-700 hover:border-[#6b2fa5]/40 hover:text-[#6b2fa5] disabled:opacity-60 transition-colors shadow-sm"
              >
                {isLoadingDraft ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderOpen className="w-4 h-4" />}
                Load Draft
              </button>
            )}
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={isSavingDraft || !hasContent}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/90 backdrop-blur border-2 border-slate-200 text-sm font-semibold text-slate-700 hover:border-[#6b2fa5]/40 hover:text-[#6b2fa5] disabled:opacity-60 disabled:hover:text-slate-700 disabled:hover:border-slate-200 transition-colors shadow-sm"
            >
              {isSavingDraft ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save
            </button>
          </div>
        </div>

        {/* Page Header */}
        <div className="text-center space-y-4 animate-in fade-in duration-700">
          <h1 className="text-5xl font-bold text-white drop-shadow-lg">
            Create One-Time Event
          </h1>

          <p className="text-lg text-slate-100 max-w-2xl mx-auto drop-shadow">
            Fill in the details below to create your event. All fields marked with * are required.
          </p>

          {/* Step Titles */}
          <div className="flex justify-center items-center gap-2 flex-wrap mt-6">
            <span
              className={`text-sm font-semibold px-3 py-1.5 rounded-full ${
                currentStep === 1 ? "bg-[#6b2fa5] text-white" : "bg-slate-200 text-slate-600"
              }`}
            >
              1. Event Info
            </span>
            <span className="text-slate-400">→</span>
            <span
              className={`text-sm font-semibold px-3 py-1.5 rounded-full ${
                currentStep === 2 ? "bg-[#6b2fa5] text-white" : "bg-slate-200 text-slate-600"
              }`}
            >
              2. Location
            </span>
            <span className="text-slate-400">→</span>
            <span
              className={`text-sm font-semibold px-3 py-1.5 rounded-full ${
                currentStep === 3 ? "bg-[#6b2fa5] text-white" : "bg-slate-200 text-slate-600"
              }`}
            >
              3. Date & Time
            </span>
            <span className="text-slate-400">→</span>
            <span
              className={`text-sm font-semibold px-3 py-1.5 rounded-full ${
                currentStep === 4 ? "bg-[#6b2fa5] text-white" : "bg-slate-200 text-slate-600"
              }`}
            >
              4. Pricing
            </span>
            <span className="text-slate-400">→</span>
            <span
              className={`text-sm font-semibold px-3 py-1.5 rounded-full ${
                currentStep === 5 ? "bg-[#6b2fa5] text-white" : "bg-slate-200 text-slate-600"
              }`}
            >
              5. Settings
            </span>
            <span className="text-slate-400">→</span>
            <span
              className={`text-sm font-semibold px-3 py-1.5 rounded-full ${
                currentStep === 6 ? "bg-[#6b2fa5] text-white" : "bg-slate-200 text-slate-600"
              }`}
            >
              6. Affiliate
            </span>
          </div>
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

        {/* API Warnings */}
        {apiWarnings.length > 0 && (
          <div className="flex gap-3 p-4 rounded-xl bg-amber-50 border-2 border-amber-200 shadow-sm animate-in slide-in-from-top-2 duration-300">
            <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-amber-900 mb-2">Warnings</p>
              <ul className="space-y-1">
                {apiWarnings.map((warning, index) => (
                  <li key={index} className="text-amber-800 text-sm">
                    • {warning}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Current Step Content */}
        {renderStep()}

        {/* Navigation */}
        <FormNavigation
          currentStep={currentStep}
          totalSteps={totalSteps}
          onNext={handleNext}
          onPrevious={handlePrevious}
          onSubmit={handleSubmit}
          isSubmitting={loading}
          isUploading={isUploading.some((uploading) => uploading)}
          canProceed={canProceedToNextStep()}
        />
      </div>

      {/* Map Picker Modal */}
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