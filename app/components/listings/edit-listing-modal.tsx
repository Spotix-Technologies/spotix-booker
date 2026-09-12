"use client"

import type React from "react"

import { useState } from "react"
import { authFetch } from "@/lib/auth-client"
import { uploadListingImages, deleteListingImage } from "@/lib/listing-image-uploader"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { ImageUploader } from "./image-uploader"
import Image from "next/image"
import { X, Save, FileText, DollarSign, Hash, Calendar, Percent, Plus, AlertCircle } from "lucide-react"

interface EditListingModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  listing: any
  userId: string
  onUpdate: () => void
}

export function EditListingModal({ open, onOpenChange, listing, userId, onUpdate }: EditListingModalProps) {
  const [productName, setProductName] = useState(listing.productName)
  const [description, setDescription] = useState(listing.description)
  const [price, setPrice] = useState(listing.price.toString())
  const [quantity, setQuantity] = useState((listing.quantity ?? 0).toString())
  const [startDate, setStartDate] = useState(listing.startDate ? listing.startDate.slice(0, 10) : "")
  const [endDate, setEndDate] = useState(listing.endDate ? listing.endDate.slice(0, 10) : "")
  const [feeBurdenChoice, setFeeBurdenChoice] = useState<"buyer" | "organizer">(
    listing.feeBurden?.coversSpotixFee && listing.feeBurden?.coversPaystackFee ? "organizer" : "buyer"
  )
  const [newImages, setNewImages] = useState<File[]>([])
  const [existingImages, setExistingImages] = useState<string[]>(listing.images || [])
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [deletingImageIndex, setDeletingImageIndex] = useState<number | null>(null)

  const validateForm = () => {
    const newErrors: Record<string, string> = {}
    if (!productName.trim()) newErrors.productName = "Product name is required"
    if (!description.trim()) newErrors.description = "Description is required"
    if (!price || Number.parseFloat(price) <= 0) newErrors.price = "Valid price is required"
    if (!quantity || Number.parseInt(quantity, 10) < 0 || !Number.isFinite(Number.parseInt(quantity, 10))) {
      newErrors.quantity = "Valid quantity is required"
    }
    if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
      newErrors.endDate = "End date must be on or after the start date"
    }
    if (existingImages.length + newImages.length === 0) newErrors.images = "At least 1 image is required"
    if (existingImages.length + newImages.length > 6) newErrors.images = "Maximum 6 images allowed"
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return

    setLoading(true)
    try {
      let allImages = [...existingImages]

      if (newImages.length > 0) {
        const newImageUrls = await uploadListingImages(newImages)
        allImages = [...allImages, ...newImageUrls].slice(0, 6)
      }

      const res = await authFetch(`/api/listings/${listing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName,
          description,
          price: Number.parseFloat(price),
          images: allImages,
          quantity: Number.parseInt(quantity, 10),
          startDate: startDate || null,
          endDate: endDate || null,
          feeBurden:
            feeBurdenChoice === "organizer"
              ? { coversSpotixFee: true, coversPaystackFee: true }
              : { coversSpotixFee: false, coversPaystackFee: false },
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to update listing")
      }

      onUpdate()
      onOpenChange(false)
    } catch (error) {
      console.error("Error updating listing:", error)
      setErrors({ submit: "Failed to update listing. Please try again." })
    } finally {
      setLoading(false)
    }
  }

  const removeExistingImage = async (index: number) => {
    const imageUrl = existingImages[index]
    setDeletingImageIndex(index)
    try {
      await deleteListingImage(imageUrl)
      setExistingImages(existingImages.filter((_, i) => i !== index))
    } catch (error) {
      console.error("Error deleting image:", error)
    } finally {
      setDeletingImageIndex(null)
    }
  }

  if (!open) return null

  const totalImages = existingImages.length + newImages.length

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#6b2fa5] to-[#8b3fc5] px-8 py-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">Edit Listing</h2>
              <p className="text-purple-100 text-sm">Update your product details</p>
            </div>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="w-10 h-10 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-lg flex items-center justify-center transition-all duration-200 group"
          >
            <X className="w-5 h-5 text-white group-hover:rotate-90 transition-transform duration-200" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-8 space-y-6">
          {/* Image Count Badge */}
          <div className="flex items-center justify-between bg-gradient-to-r from-[#6b2fa5]/10 to-[#8b3fc5]/10 border border-[#6b2fa5]/20 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-[#6b2fa5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <div>
                <p className="font-semibold text-gray-900">Image Gallery</p>
                <p className="text-sm text-gray-600">{totalImages} of 6 images used</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                {[...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    className={`w-2 h-2 rounded-full transition-all duration-200 ${
                      i < totalImages ? "bg-[#6b2fa5]" : "bg-gray-300"
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Existing Images */}
          {existingImages.length > 0 && (
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-bold text-gray-900">
                <svg className="w-4 h-4 text-[#6b2fa5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                Current Images
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {existingImages.map((image, index) => (
                  <div key={index} className="relative group">
                    <div className="relative aspect-square rounded-xl overflow-hidden border-2 border-gray-200 group-hover:border-[#6b2fa5] transition-all duration-200">
                      <Image
                        src={image || "/placeholder.svg"}
                        alt={`Image ${index + 1}`}
                        fill
                        className="object-cover"
                      />
                      {index === 0 && (
                        <div className="absolute top-2 left-2 bg-[#6b2fa5] text-white text-xs font-bold px-2 py-1 rounded-full">
                          Cover
                        </div>
                      )}
                      {deletingImageIndex === index && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <svg className="animate-spin h-6 w-6 text-white" fill="none" viewBox="0 0 24 24">
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            ></circle>
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            ></path>
                          </svg>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeExistingImage(index)}
                      disabled={deletingImageIndex === index}
                      className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200 shadow-lg hover:scale-110 disabled:opacity-50"
                    >
                      <X size={16} strokeWidth={3} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add New Images */}
          {totalImages < 6 && (
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-bold text-gray-900">
                <Plus className="w-4 h-4 text-[#6b2fa5]" />
                Add More Images ({6 - totalImages} slots available)
              </label>
              <ImageUploader images={newImages} setImages={setNewImages} />
            </div>
          )}

          {errors.images && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {errors.images}
            </div>
          )}

          <div className="border-t border-gray-200"></div>

          {/* Product Name */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                <FileText className="w-5 h-5 text-blue-600" />
              </div>
              <label className="block text-sm font-bold text-gray-900">Product Name *</label>
            </div>
            <Input
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="Enter product name"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] focus:border-[#6b2fa5] transition-all duration-200 hover:border-gray-400"
            />
            {errors.productName && (
              <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {errors.productName}
              </div>
            )}
          </div>

          {/* Description */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                </svg>
              </div>
              <label className="block text-sm font-bold text-gray-900">Description *</label>
            </div>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter product description"
              className="w-full min-h-[120px] px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] focus:border-[#6b2fa5] transition-all duration-200 hover:border-gray-400 resize-none"
            />
            {errors.description && (
              <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {errors.description}
              </div>
            )}
          </div>

          {/* Price */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#6b2fa5]/10 rounded-lg flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-[#6b2fa5]" />
              </div>
              <label className="block text-sm font-bold text-gray-900">Price (₦) *</label>
            </div>
            <div className="relative">
              <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500 font-semibold">₦</span>
              <Input
                type="number"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] focus:border-[#6b2fa5] transition-all duration-200 hover:border-gray-400"
              />
            </div>
            {errors.price && (
              <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {errors.price}
              </div>
            )}
          </div>

          {/* Quantity */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#6b2fa5]/10 rounded-lg flex items-center justify-center">
                <Hash className="w-5 h-5 text-[#6b2fa5]" />
              </div>
              <label className="block text-sm font-bold text-gray-900">Quantity *</label>
            </div>
            <Input
              type="number"
              step="1"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="How many units are available?"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] focus:border-[#6b2fa5] transition-all duration-200 hover:border-gray-400"
            />
            {errors.quantity && (
              <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {errors.quantity}
              </div>
            )}
          </div>

          {/* Selling window */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#6b2fa5]/10 rounded-lg flex items-center justify-center">
                <Calendar className="w-5 h-5 text-[#6b2fa5]" />
              </div>
              <label className="block text-sm font-bold text-gray-900">Selling Window (optional)</label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Start date</label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] focus:border-[#6b2fa5] transition-all duration-200 hover:border-gray-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">End date</label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] focus:border-[#6b2fa5] transition-all duration-200 hover:border-gray-400"
                />
              </div>
            </div>
            {errors.endDate && (
              <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {errors.endDate}
              </div>
            )}
          </div>

          {/* Fee burden */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#6b2fa5]/10 rounded-lg flex items-center justify-center">
                <Percent className="w-5 h-5 text-[#6b2fa5]" />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-900">Who pays the fees?</label>
                <p className="text-xs text-gray-500">Spotix's 5% platform fee + the Paystack processing fee.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFeeBurdenChoice("buyer")}
                className={`text-left p-4 rounded-lg border-2 transition-all duration-200 ${
                  feeBurdenChoice === "buyer" ? "border-[#6b2fa5] bg-[#6b2fa5]/5" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <p className="font-semibold text-sm text-gray-900">Buyer pays the fees</p>
                <p className="text-xs text-gray-500 mt-0.5">Added on top of your price at checkout.</p>
              </button>
              <button
                type="button"
                onClick={() => setFeeBurdenChoice("organizer")}
                className={`text-left p-4 rounded-lg border-2 transition-all duration-200 ${
                  feeBurdenChoice === "organizer" ? "border-[#6b2fa5] bg-[#6b2fa5]/5" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <p className="font-semibold text-sm text-gray-900">I'll cover the fees</p>
                <p className="text-xs text-gray-500 mt-0.5">Deducted from your payout instead.</p>
              </button>
            </div>
          </div>

          {errors.submit && (
            <div className="bg-red-50 border-2 border-red-300 text-red-700 px-4 py-4 rounded-xl text-sm font-medium flex items-start gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              {errors.submit}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="border-t border-gray-200 px-8 py-6 bg-gray-50 flex flex-col sm:flex-row gap-3">
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 bg-gradient-to-r from-[#6b2fa5] to-[#8b3fc5] hover:from-[#5a2789] hover:to-[#6b2fa5] text-white py-3 font-bold rounded-xl transition-all duration-200 shadow-lg shadow-[#6b2fa5]/30 hover:shadow-xl hover:shadow-[#6b2fa5]/40 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                <span>Saving Changes...</span>
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                <span>Save Changes</span>
              </>
            )}
          </Button>
          <Button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className={
              "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg transition-all " +
              "border border-[#6b2fa5] text-[#6b2fa5] bg-transparent hover:bg-[#6b2fa5]/10"
            }
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}
