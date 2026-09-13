"use client"

/**
 * CreateEventGroup — "Create a new collection".
 *
 * Collections were reworked (item 3 of the Sep 2026 create-event fixes)
 * to be pure containers: just a name, description, and cover image. This
 * form no longer creates events directly — an organizer creates the
 * individual event the normal way (the One-Time Event flow) and then
 * attaches it to a collection from the Collections Manager
 * (collection-selector.tsx -> manage-collection-events.tsx).
 */

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { AlertCircle, CheckCircle, Upload, Type, AlignLeft, ImageIcon, Sparkles, X } from "lucide-react"
import { Preloader } from "@/components/preloader"
import Image from "next/image"
import { authFetch } from "@/lib/auth-client"
import { uploadImage } from "@/lib/image-uploader"

export interface CreatedCollection {
  id: string
  name: string
  description: string
  image: string
  eventCount: number
}

interface CreateEventGroupProps {
  onCreated: (collection: CreatedCollection) => void
}

export function CreateEventGroup({ onCreated }: CreateEventGroupProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")

  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const cancelUploadRef = useRef<(() => void) | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    return () => {
      cancelUploadRef.current?.()
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startUpload = (file: File) => {
    cancelUploadRef.current?.()

    setImageFile(file)
    setImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })
    setUploadedImageUrl(null)
    setIsUploading(true)
    setUploadProgress(0)

    const { uploadPromise, cancelUpload } = uploadImage(file, {
      cloudinaryFolder: "EventCollections",
      onProgress: setUploadProgress,
      showAlert: false,
    })
    cancelUploadRef.current = cancelUpload

    uploadPromise
      .then(({ url }) => {
        setIsUploading(false)
        if (url) setUploadedImageUrl(url)
        else setError("Image upload failed. Please try a different image.")
      })
      .catch(() => {
        setIsUploading(false)
        setError("Image upload failed. Please try a different image.")
      })
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) startUpload(file)
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
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/"))
    if (file) startUpload(file)
  }

  const removeImage = () => {
    cancelUploadRef.current?.()
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
    setImageFile(null)
    setImagePreviewUrl(null)
    setUploadedImageUrl(null)
    setIsUploading(false)
    setUploadProgress(0)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!name.trim() || !description.trim()) {
      setError("Please fill in the collection name and description")
      return
    }
    if (!imageFile) {
      setError("Please add a cover image for the collection")
      return
    }
    if (isUploading) {
      setError("Please wait for the image to finish uploading")
      return
    }
    if (!uploadedImageUrl) {
      setError("Image upload hasn't completed yet. Please try again.")
      return
    }

    setLoading(true)
    try {
      const response = await authFetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          image: uploadedImageUrl,
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Failed to create collection")

      onCreated({
        id: data.collectionId,
        name: name.trim(),
        description: description.trim(),
        image: uploadedImageUrl,
        eventCount: 0,
      })
    } catch (err: any) {
      setError(err.message || "Failed to create collection. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Preloader isLoading={loading} />

      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-8 pb-12">
        {/* Page Header */}
        <div className="text-center space-y-4 animate-in fade-in duration-700">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-[#6b2fa5] to-purple-600 rounded-2xl shadow-lg shadow-[#6b2fa5]/30 mb-4">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-[#6b2fa5] via-[#8b3fc5] to-[#6b2fa5] bg-clip-text text-transparent">
            Create a Collection
          </h1>
          <p className="text-lg text-slate-600 max-w-xl mx-auto">
            Give your series a name, description, and cover image. Once it's created, add
            events to it from the Collections Manager.
          </p>
        </div>

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
            <h2 className="text-2xl font-bold text-slate-900">Collection Information</h2>
          </div>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Collection Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g., Monthly Tech Meetup"
                value={name}
                onChange={(e) => setName(e.target.value)}
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
                  placeholder="Describe this collection..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                  rows={5}
                  className="w-full pl-11 pr-4 py-3 border-2 border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] focus:border-[#6b2fa5] transition-all duration-200 text-slate-900 placeholder:text-slate-400 resize-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Cover Image */}
        <div className="space-y-6 rounded-xl border-2 border-slate-200 bg-white p-5 sm:p-6 lg:p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex items-center justify-center w-10 h-10 bg-[#6b2fa5]/10 rounded-lg">
              <ImageIcon className="w-5 h-5 text-[#6b2fa5]" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">Cover Image</h2>
          </div>

          {imagePreviewUrl ? (
            <div className="relative w-full h-56 rounded-xl overflow-hidden border-2 border-slate-200">
              <Image
                src={imagePreviewUrl}
                alt="Collection cover"
                fill
                className="object-cover"
              />
              <button
                type="button"
                onClick={removeImage}
                className="absolute top-3 right-3 bg-red-500 hover:bg-red-600 text-white p-2 rounded-lg transition-all duration-200 shadow-md hover:scale-110"
              >
                <X className="h-4 w-4" />
              </button>
              {isUploading && (
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center backdrop-blur-sm">
                  <div className="w-3/4 h-2.5 bg-slate-700 rounded-full overflow-hidden mb-2">
                    <div
                      className="h-full bg-gradient-to-r from-[#6b2fa5] to-purple-500 transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <p className="text-white text-sm font-semibold">{uploadProgress}%</p>
                </div>
              )}
              {uploadedImageUrl && !isUploading && (
                <div className="absolute top-3 left-3 bg-emerald-500 text-white p-1.5 rounded-lg shadow-md">
                  <CheckCircle className="h-4 w-4" />
                </div>
              )}
            </div>
          ) : (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 sm:p-12 text-center cursor-pointer transition-all duration-300 ${
                isDragging
                  ? "border-[#6b2fa5] bg-[#6b2fa5]/5 scale-[1.02]"
                  : "border-slate-300 hover:border-[#6b2fa5] hover:bg-slate-50"
              }`}
            >
              <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-2xl mb-4">
                <Upload className="h-8 w-8 text-slate-400" />
              </div>
              <p className="text-lg font-bold text-slate-900 mb-2">Upload Cover Image</p>
              <p className="text-sm text-slate-600">Drag and drop an image here, or click to select a file</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="hidden"
              />
            </div>
          )}

          <div className="flex items-start gap-2 p-4 rounded-lg bg-blue-50 border border-blue-200">
            <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-800">
              All images are automatically uploaded to Spotix Servers for fast, reliable hosting.
            </p>
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading || isUploading}
          className="w-full group inline-flex items-center justify-center gap-3 px-8 py-4 bg-gradient-to-r from-[#6b2fa5] to-purple-600 hover:from-[#5a2589] hover:to-[#6b2fa5] text-white font-bold text-lg rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-[#6b2fa5]/30 hover:shadow-xl hover:shadow-[#6b2fa5]/40 hover:-translate-y-0.5 active:translate-y-0"
        >
          {loading ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Creating...
            </>
          ) : isUploading ? (
            <>
              <Upload className="w-5 h-5 animate-pulse" />
              Uploading Image...
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5 group-hover:rotate-12 transition-transform" />
              Create Collection
            </>
          )}
        </button>
      </form>
    </>
  )
}
