"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { authFetch, getAccessToken, tryRefreshTokens } from "@/lib/auth-client"
import { waitForAuthInit } from "@/hooks/useAuth"
import { db } from "@/lib/firebase"
import { doc, getDoc, updateDoc, collection, addDoc, query, where, getDocs } from "firebase/firestore"
import { uploadImage } from "@/lib/image-uploader"
import { Button } from "@/components/ui/button"
import { ResponsiveSheet } from "@/components/ui/responsive-sheet"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  AlertCircle, CheckCircle2, Copy, Upload,
  FileText, Camera, MapPin, Shield, ArrowLeft,
  User, Home, ClipboardList, AlertTriangle,
} from "lucide-react"

interface UserData {
  uid: string
  username: string
  email: string
  fullName: string
  phoneNumber: string
  dateOfBirth: string
  isVerified: boolean
}

interface DocumentRejection {
  problem: string
  suggestion: string
  rejectedBy?: string
}

interface DocumentStatus {
  status: "pending" | "completed"
  dateUploaded: string
  timeUploaded: string
  fileUrl: string
  provider?: string
  rejection?: DocumentRejection | null
}

interface VerificationData {
  nin: DocumentStatus
  selfie: DocumentStatus
  proofOfAddress: DocumentStatus
  address: string
  verificationState: "Not Verified" | "Awaiting Verification" | "Verified"
  uid: string
}

function calculateAge(dateOfBirth: string): string {
  try {
    const dob   = new Date(dateOfBirth)
    const today = new Date()
    let age = today.getFullYear() - dob.getFullYear()
    const md = today.getMonth() - dob.getMonth()
    if (md < 0 || (md === 0 && today.getDate() < dob.getDate())) age--
    return age.toString()
  } catch {
    return "Unknown"
  }
}

const DOC_META: Record<string, { label: string; icon: React.ReactNode; hint: string }> = {
  nin:            { label: "National ID (NIN)", icon: <FileText size={15} />, hint: "Upload a clear photo of your NIN slip or virtual NIN" },
  selfie:         { label: "Selfie",            icon: <Camera size={15} />,   hint: "A clear photo of your face — image files only" },
  proofOfAddress: { label: "Proof of Address",  icon: <MapPin size={15} />,   hint: "Utility bill, bank statement, or government letter" },
}

export default function VerificationPage() {
  const router = useRouter()
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [userData, setUserData]       = useState<UserData | null>(null)
  const [uid, setUid]                 = useState<string>("")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [ageError, setAgeError]       = useState<string | null>(null)
  const [verificationData, setVerificationData] = useState<VerificationData>({
    nin:            { status: "pending", dateUploaded: "", timeUploaded: "", fileUrl: "" },
    selfie:         { status: "pending", dateUploaded: "", timeUploaded: "", fileUrl: "" },
    proofOfAddress: { status: "pending", dateUploaded: "", timeUploaded: "", fileUrl: "" },
    address:        "",
    verificationState: "Not Verified",
    uid: "",
  })
  const [uploadProgress, setUploadProgress]   = useState<Record<string, number>>({ nin: 0, selfie: 0, proofOfAddress: 0 })
  const [showUploadDialog, setShowUploadDialog] = useState<string | null>(null)
  const fileInputRef   = useRef<HTMLInputElement>(null)
  const [verificationId, setVerificationId]   = useState("")
  const [copied, setCopied]                   = useState(false)
  const [allMet, setAllMet]                   = useState(false)
  const [openTooltip, setOpenTooltip]         = useState<string | null>(null)

  // ── Auth (JWT only, no Firebase client Auth) ──────────────────────────────
  useEffect(() => {
    const init = async () => {
      try {
        await waitForAuthInit()

        let token = getAccessToken()
        if (!token) {
          const ok = await tryRefreshTokens()
          if (!ok) { router.push("/login"); return }
          token = getAccessToken()
        }
        if (!token) { router.push("/login"); return }

        const meRes = await authFetch("/api/user/me")
        if (!meRes.ok) { router.push("/login"); return }

        const me = await meRes.json()
        const resolvedUid: string = me?.uid ?? me?.id ?? ""
        if (!resolvedUid) { router.push("/login"); return }
        setUid(resolvedUid)

        // Fetch Firestore user doc using Admin-side uid
        const userDocRef = doc(db, "users", resolvedUid)
        const userDoc    = await getDoc(userDocRef)

        if (!userDoc.exists()) { router.push("/profile"); return }

        const data = userDoc.data()
        if (data.isVerified) {
          alert("You are already verified! Redirecting to your profile.")
          router.push("/profile")
          return
        }

        if (data.dateOfBirth) {
          const age = calculateAge(data.dateOfBirth)
          if (parseInt(age) < 18) setAgeError("You must be at least 18 years old to be verified as a booker.")
        }

        const u: UserData = {
          uid:           resolvedUid,
          username:      data.username      || "",
          email:         data.email         || "",
          fullName:      data.fullName       || "",
          phoneNumber:   data.phoneNumber    || "",
          dateOfBirth:   data.dateOfBirth    || "",
          isVerified:    data.isVerified     || false,
        }
        setUserData(u)
        setPhoneNumber(u.phoneNumber)

        const vq       = query(collection(db, "verification"), where("uid", "==", resolvedUid))
        const vSnap    = await getDocs(vq)
        if (!vSnap.empty) {
          const vDoc  = vSnap.docs[0]
          const vData = vDoc.data() as VerificationData
          setVerificationId(vDoc.id)
          setVerificationData({
            nin:            vData.nin            || { status: "pending", dateUploaded: "", timeUploaded: "", fileUrl: "", rejection: null },
            selfie:         vData.selfie          || { status: "pending", dateUploaded: "", timeUploaded: "", fileUrl: "", rejection: null },
            proofOfAddress: vData.proofOfAddress  || { status: "pending", dateUploaded: "", timeUploaded: "", fileUrl: "", rejection: null },
            address:        vData.address         || "",
            verificationState: vData.verificationState || "Not Verified",
            uid:            resolvedUid,
          })
        } else {
          setVerificationData((p) => ({ ...p, uid: resolvedUid }))
        }
      } catch (err) {
        console.error("Verification auth error:", err)
        router.push("/login")
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [router])

  // ── Requirements check ────────────────────────────────────────────────────
  useEffect(() => {
    const docsOk    = verificationData.nin.status === "completed"
                   && verificationData.selfie.status === "completed"
                   && verificationData.proofOfAddress.status === "completed"
    setAllMet(docsOk && verificationData.address.trim() !== "" && phoneNumber.trim() !== "" && verificationId !== "" && !ageError)
  }, [verificationData, verificationId, phoneNumber, ageError])

  // ── Firestore helpers ─────────────────────────────────────────────────────
  const saveToFirestore = async (data: VerificationData) => {
    const payload = {
      nin:            { status: data.nin.status,            dateUploaded: data.nin.dateUploaded,            timeUploaded: data.nin.timeUploaded,            fileUrl: data.nin.fileUrl,            provider: data.nin.provider ?? null,            rejection: data.nin.rejection ?? null },
      selfie:         { status: data.selfie.status,         dateUploaded: data.selfie.dateUploaded,         timeUploaded: data.selfie.timeUploaded,         fileUrl: data.selfie.fileUrl,         provider: data.selfie.provider ?? null,         rejection: data.selfie.rejection ?? null },
      proofOfAddress: { status: data.proofOfAddress.status, dateUploaded: data.proofOfAddress.dateUploaded, timeUploaded: data.proofOfAddress.timeUploaded, fileUrl: data.proofOfAddress.fileUrl, provider: data.proofOfAddress.provider ?? null, rejection: data.proofOfAddress.rejection ?? null },
      address: data.address, verificationState: data.verificationState, uid: data.uid,
    }
    if (verificationId) {
      await updateDoc(doc(db, "verification", verificationId), payload)
    } else {
      const ref = await addDoc(collection(db, "verification"), payload)
      setVerificationId(ref.id)
    }
  }

  // ── Upload ────────────────────────────────────────────────────────────────
  const handleUploadClick = (docType: string) => {
    setShowUploadDialog(docType)
    if (fileInputRef.current) fileInputRef.current.value = ""
    setTimeout(() => fileInputRef.current?.click(), 100)
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length || !showUploadDialog || !userData) { setShowUploadDialog(null); return }
    const file     = e.target.files[0]
    const docType  = showUploadDialog

    if (docType === "selfie" && !file.type.startsWith("image/")) { alert("Please upload an image file for your selfie"); setShowUploadDialog(null); return }
    if (docType !== "selfie" && !file.type.startsWith("image/") && file.type !== "application/pdf") { alert("Please upload an image or PDF file"); setShowUploadDialog(null); return }

    try {
      setUploadProgress((p) => ({ ...p, [docType]: 10 }))
      const interval = setInterval(() => setUploadProgress((p) => ({ ...p, [docType]: Math.min((p[docType] || 0) + 10, 90) })), 500)
      const { uploadPromise } = uploadImage(file, { cloudinaryFolder: "Verification", showAlert: true })
      const { url: fileUrl, provider } = await uploadPromise
      clearInterval(interval)
      if (!fileUrl) throw new Error("Upload failed")
      setUploadProgress((p) => ({ ...p, [docType]: 100 }))
      const now   = new Date()
      const updated: VerificationData = {
        ...verificationData,
        // A fresh upload clears any prior rejection — the admin reviews the new file, not the old reason.
        [docType]: { status: "completed" as const, dateUploaded: now.toLocaleDateString(), timeUploaded: now.toLocaleTimeString(), fileUrl, provider, rejection: null },
      }
      const allDone = updated.nin.status === "completed" && updated.selfie.status === "completed" && updated.proofOfAddress.status === "completed"
      if (allDone && updated.address.trim()) updated.verificationState = "Awaiting Verification"
      setVerificationData(updated)
      await saveToFirestore(updated)
      setTimeout(() => { setShowUploadDialog(null); setUploadProgress((p) => ({ ...p, [docType]: 0 })) }, 1000)
    } catch {
      alert("Failed to upload file. Please try again.")
      setUploadProgress((p) => ({ ...p, [docType]: 0 }))
      setShowUploadDialog(null)
    }
  }

  const saveVerification = async () => {
    if (!userData || ageError) { if (ageError) alert(ageError); return }
    setSaving(true)
    try {
      if (phoneNumber !== userData.phoneNumber) await updateDoc(doc(db, "users", userData.uid), { phoneNumber })
      await saveToFirestore(verificationData)
      alert("Verification information saved successfully!")
      router.push("/profile")
    } catch { alert("Failed to save verification data. Please try again.") }
    finally { setSaving(false) }
  }

  const copyId = () => {
    if (!verificationId) return
    navigator.clipboard.writeText(verificationId).then(() => { setCopied(true); setTimeout(() => setCopied(false), 3000) })
  }

  const stateStyle = {
    Verified:              "bg-emerald-50 text-emerald-700 border-emerald-200",
    "Awaiting Verification": "bg-amber-50 text-amber-700 border-amber-200",
    "Not Verified":        "bg-slate-50 text-slate-600 border-slate-200",
  }[verificationData.verificationState] ?? "bg-slate-50 text-slate-600 border-slate-200"

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#6b2fa5]/30 border-t-[#6b2fa5] rounded-full animate-spin" />
          <p className="text-sm text-slate-500">Loading verification data…</p>
        </div>
      </div>
    )
  }

  if (!userData) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-white rounded-xl border border-red-200 p-6 flex items-start gap-3">
          <AlertCircle size={18} className="text-red-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-700">User data not found</p>
            <p className="text-xs text-red-600 mt-1">Please log in again to continue.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-5">

        {/* Page header */}
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <ArrowLeft size={16} />
          </button>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#6b2fa5]">Identity</p>
            <h1 className="text-xl font-bold text-slate-900 leading-tight">Booker Verification</h1>
          </div>
          <span className={`ml-auto inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${stateStyle}`}>
            {verificationData.verificationState}
          </span>
        </div>

        {/* Info banner */}
        <div className="bg-[#6b2fa5]/6 border border-[#6b2fa5]/15 rounded-xl p-4 flex gap-3">
          <Shield size={18} className="text-[#6b2fa5] flex-shrink-0 mt-0.5" />
          <p className="text-sm text-slate-600 leading-relaxed">
            Verification is free. We never publicly share your uploaded documents. All data is stored securely and used only for identity confirmation.
          </p>
        </div>

        {/* Age error */}
        {ageError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3">
            <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-700">Age requirement not met</p>
              <p className="text-xs text-red-600 mt-1">{ageError}</p>
              <button onClick={() => router.push("/profile")} className="mt-2 text-xs font-semibold text-red-600 underline underline-offset-2">
                Return to profile
              </button>
            </div>
          </div>
        )}

        {/* Personal info */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100">
            <User size={14} className="text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-800">Personal information</h2>
          </div>
          <div className="p-5 grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Full name</label>
              <Input value={userData.fullName} readOnly className="bg-slate-50 text-slate-700 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Email</label>
              <Input value={userData.email} readOnly className="bg-slate-50 text-slate-700 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Phone number</label>
              <Input
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value.replace(/[^0-9]/g, "").slice(0, 11))}
                placeholder="Enter your phone number"
                maxLength={11}
                className="text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Age</label>
              <Input
                value={userData.dateOfBirth ? calculateAge(userData.dateOfBirth) : "Not provided"}
                readOnly
                className={`bg-slate-50 text-sm ${parseInt(calculateAge(userData.dateOfBirth)) < 18 ? "border-red-400 text-red-600" : "text-slate-700"}`}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Verification ID</label>
              <div className="flex gap-2">
                <Input value={verificationId} readOnly placeholder="Generated after first upload" className="bg-slate-50 text-slate-700 text-sm font-mono" />
                {verificationId && (
                  <Button variant="outline" onClick={copyId} className={`shrink-0 text-xs px-3 ${copied ? "border-emerald-300 text-emerald-600" : "border-slate-200 text-slate-600"}`}>
                    <Copy size={13} className="mr-1.5" />
                    {copied ? "Copied!" : "Copy"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Address */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100">
            <Home size={14} className="text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-800">Residential address</h2>
          </div>
          <div className="p-5">
            <Textarea
              value={verificationData.address}
              onChange={(e) => setVerificationData((p) => ({ ...p, address: e.target.value }))}
              placeholder="Enter your full residential address"
              rows={3}
              className="text-sm resize-none"
            />
          </div>
        </section>

        {/* Documents */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100">
            <ClipboardList size={14} className="text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-800">Documents</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {(["nin", "selfie", "proofOfAddress"] as const).map((docType) => {
              const meta     = DOC_META[docType]
              const docState = verificationData[docType]
              const done     = docState.status === "completed"
              const rejected = !done && !!docState.rejection
              return (
                <div key={docType} className="flex items-start sm:items-center justify-between gap-4 p-5 flex-col sm:flex-row">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      done ? "bg-emerald-50 text-emerald-600" : rejected ? "bg-red-50 text-red-500" : "bg-slate-100 text-slate-500"
                    }`}>
                      {meta.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold text-slate-800">{meta.label}</p>
                        {rejected && (
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setOpenTooltip((cur) => (cur === docType ? null : docType))}
                              onBlur={() => setTimeout(() => setOpenTooltip((cur) => (cur === docType ? null : cur)), 150)}
                              className="text-red-500 hover:text-red-600"
                              aria-label={`Why ${meta.label} was rejected`}
                            >
                              <AlertTriangle size={14} />
                            </button>
                            {openTooltip === docType && (
                              <div className="absolute z-20 left-0 top-full mt-2 w-64 bg-slate-900 text-white text-xs rounded-lg shadow-xl p-3 space-y-2">
                                <div>
                                  <p className="font-semibold text-red-300 mb-0.5">Why it was rejected</p>
                                  <p className="text-slate-200">{docState.rejection?.problem}</p>
                                </div>
                                <div>
                                  <p className="font-semibold text-emerald-300 mb-0.5">Suggestion</p>
                                  <p className="text-slate-200">{docState.rejection?.suggestion}</p>
                                </div>
                                <div className="absolute -top-1.5 left-3 w-3 h-3 bg-slate-900 rotate-45" />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{meta.hint}</p>
                      {done && (
                        <p className="text-xs text-emerald-600 mt-1 font-medium">
                          Uploaded {docState.dateUploaded} at {docState.timeUploaded}
                          {docState.provider && ` · ${docState.provider}`}
                        </p>
                      )}
                      {rejected && (
                        <p className="text-xs text-red-600 mt-1 font-medium">
                          Rejected — tap the warning icon for details, then re-upload
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {done && <span className="w-2 h-2 rounded-full bg-emerald-500" />}
                    {rejected && <span className="w-2 h-2 rounded-full bg-red-500" />}
                    <Button
                      onClick={() => handleUploadClick(docType)}
                      className={done
                        ? "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs h-8 px-3"
                        : rejected
                          ? "bg-red-600 hover:bg-red-700 text-white text-xs h-8 px-3"
                          : "bg-[#6b2fa5] hover:bg-[#5a2589] text-white text-xs h-8 px-3"
                      }
                      variant={done ? "outline" : "default"}
                    >
                      <Upload size={12} className="mr-1.5" />
                      {done ? "Replace" : rejected ? "Re-upload" : "Upload"}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* Completion banner */}
        {allMet && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 flex gap-3">
            <CheckCircle2 size={18} className="text-emerald-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-3 flex-1">
              <div>
                <p className="text-sm font-semibold text-emerald-800">All requirements met</p>
                <p className="text-xs text-emerald-700 mt-1">
                  Share your Verification ID with our team at{" "}
                  <strong>support@spotix.com.ng</strong> to complete the process.
                </p>
              </div>
              <div className="flex gap-2">
                <Input value={verificationId} readOnly className="bg-white text-sm font-mono h-8 text-xs" />
                <Button onClick={copyId} className={`shrink-0 h-8 px-3 text-xs ${copied ? "bg-emerald-600" : "bg-[#6b2fa5]"} text-white`}>
                  <Copy size={12} className="mr-1" />
                  {copied ? "Copied!" : "Copy"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pb-4">
          <Button variant="outline" onClick={() => router.push("/profile")} className="border-slate-200 text-slate-600 text-sm">
            Cancel
          </Button>
          <Button
            onClick={saveVerification}
            disabled={!!ageError || saving}
            className="bg-[#6b2fa5] hover:bg-[#5a2589] text-white text-sm px-5"
          >
            {saving ? "Saving…" : "Save verification"}
          </Button>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
          accept={showUploadDialog === "selfie" ? "image/*" : "image/*,.pdf"}
        />

        {/* Upload modal */}
        {showUploadDialog && (
          <ResponsiveSheet
            open
            onClose={() => setShowUploadDialog(null)}
            size="sm"
            title={`Upload ${DOC_META[showUploadDialog]?.label ?? ""}`}
            description={DOC_META[showUploadDialog]?.hint}
            icon={
              <div className="w-9 h-9 rounded-xl bg-[#6b2fa5]/8 flex items-center justify-center text-[#6b2fa5]">
                {DOC_META[showUploadDialog]?.icon}
              </div>
            }
            footer={
              <Button variant="outline" onClick={() => setShowUploadDialog(null)} className="w-full border-slate-200 text-sm">
              Cancel
            </Button>
            }
          >
            <div className="space-y-4">
              <div
                className="border-2 border-dashed border-[#6b2fa5]/25 rounded-xl p-10 text-center cursor-pointer hover:bg-[#6b2fa5]/4 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={24} className="mx-auto text-[#6b2fa5] mb-3" />
                <p className="text-sm font-semibold text-[#6b2fa5]">Click to select file</p>
                <p className="text-xs text-slate-400 mt-1">Secured by Spotix</p>
              </div>
              {uploadProgress[showUploadDialog] > 0 && (
                <div className="space-y-1.5">
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-[#6b2fa5] h-1.5 rounded-full transition-all duration-300" style={{ width: `${uploadProgress[showUploadDialog]}%` }} />
                  </div>
                  <p className="text-xs text-center text-slate-500">{uploadProgress[showUploadDialog]}%</p>
                </div>
              )}
            </div>
          </ResponsiveSheet>
        )}

      </div>
    </div>
  )
}
