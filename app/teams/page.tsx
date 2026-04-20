// app/teams/page.tsx
"use client"

import { useEffect, useState, useCallback, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import {
  Users, Shield, UserCheck, Calculator, ArrowLeft, Plus, Search,
  Loader2, X, Check, ChevronRight, Trash2, Crown, AlertCircle,
  RefreshCw, UserPlus, Edit2, Info, Settings,
} from "lucide-react"
import { tryRefreshTokens, getAccessToken } from "@/lib/auth-client"
import { auth } from "@/lib/firebase"
import { onAuthStateChanged } from "firebase/auth"

// ── Types ─────────────────────────────────────────────────────────────────────
interface OwnedEvent {
  id: string
  eventName: string
  status: string
  eventDate: string
  eventVenue: string
}

interface Collaborator {
  collaborationId: string
  collaboratorId: string
  collaboratorEmail: string
  displayName: string
  role: string
  permissions: string[] | null
  addedAt: string | null
}

interface LookedUpUser {
  userId: string
  email: string
  fullName: string
  username: string
}

// ── All available tabs a custom role can be granted ───────────────────────────
const ALL_PERMISSIONS: { id: string; label: string }[] = [
  { id: "overview",   label: "Overview" },
  { id: "attendees",  label: "Attendees" },
  { id: "payouts",    label: "Payouts" },
  { id: "discounts",  label: "Discounts" },
  { id: "merch",      label: "Merch" },
  { id: "referrals",  label: "Referrals" },
  { id: "form",       label: "Form" },
  { id: "responses",  label: "Responses" },
  { id: "weather",    label: "Weather" },
  { id: "share",      label: "Share Event" },
  { id: "transfer",   label: "Transfer Event" },
]

// ── Built-in role config ──────────────────────────────────────────────────────
const BUILT_IN_ROLES = [
  {
    id: "admin",
    label: "Admin",
    icon: <Shield size={16} />,
    color: "bg-rose-50 text-rose-700 border-rose-200",
    activeColor: "bg-rose-600 text-white border-rose-600",
    description: "Full access except creating payout methods",
    permissions: ["overview", "attendees", "payouts", "discounts", "merch", "referrals", "form", "responses", "weather", "share", "transfer"],
    restricted: ["Edit Event", "Create Payout Method"],
  },
  {
    id: "checkin",
    label: "Check-in",
    icon: <UserCheck size={16} />,
    color: "bg-blue-50 text-blue-700 border-blue-200",
    activeColor: "bg-blue-600 text-white border-blue-600",
    description: "Attendee check-in and event day operations",
    permissions: ["attendees", "share", "weather", "form", "responses"],
    restricted: ["Overview", "Payouts", "Discounts", "Merch", "Referrals", "Transfer", "Edit Event"],
  },
  {
    id: "accountant",
    label: "Accountant",
    icon: <Calculator size={16} />,
    color: "bg-purple-50 text-purple-700 border-purple-200",
    activeColor: "bg-purple-600 text-white border-purple-600",
    description: "Financial visibility — revenue, payouts and discounts",
    permissions: ["overview", "share", "payouts", "discounts", "merch"],
    restricted: ["Attendees", "Referrals", "Form", "Responses", "Weather", "Transfer", "Edit Event"],
  },
]

const BUILT_IN_IDS = BUILT_IN_ROLES.map((r) => r.id)

function isBuiltIn(role: string) {
  return BUILT_IN_IDS.includes(role)
}

function getBuiltInConfig(roleId: string) {
  return BUILT_IN_ROLES.find((r) => r.id === roleId)
}

// ── Role badge ─────────────────────────────────────────────────────────────────
function RoleBadge({ role }: { role: string }) {
  const cfg = getBuiltInConfig(role)
  if (cfg) {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${cfg.color}`}>
        {cfg.icon}{cfg.label}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border bg-slate-50 text-slate-700 border-slate-200">
      <Settings size={12} />{role}
    </span>
  )
}

// ── Status dot ────────────────────────────────────────────────────────────────
function StatusDot({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-green-400", inactive: "bg-amber-400",
    cancelled: "bg-red-400", completed: "bg-slate-400",
  }
  return <span className={`w-2 h-2 rounded-full flex-shrink-0 ${map[status] ?? "bg-slate-300"}`} />
}

// ── Permission Checklist (for custom roles) ───────────────────────────────────
function PermissionChecklist({
  selected,
  onChange,
}: {
  selected: string[]
  onChange: (perms: string[]) => void
}) {
  function toggle(id: string) {
    onChange(
      selected.includes(id)
        ? selected.filter((p) => p !== id)
        : [...selected, id]
    )
  }
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Select what this role can access</p>
      <div className="grid grid-cols-2 gap-1.5">
        {ALL_PERMISSIONS.map((p) => {
          const checked = selected.includes(p.id)
          return (
            <button
              key={p.id}
              onClick={() => toggle(p.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm text-left transition-all ${
                checked
                  ? "border-[#6b2fa5] bg-purple-50 text-[#6b2fa5] font-semibold"
                  : "border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
              <span className={`w-4 h-4 rounded flex-shrink-0 border flex items-center justify-center ${
                checked ? "bg-[#6b2fa5] border-[#6b2fa5]" : "border-slate-300"
              }`}>
                {checked && <Check size={10} className="text-white" />}
              </span>
              {p.label}
            </button>
          )
        })}
      </div>
      {selected.length === 0 && (
        <p className="text-xs text-amber-600">No permissions selected — this role will see nothing.</p>
      )}
    </div>
  )
}

// ── Role Selector ─────────────────────────────────────────────────────────────
function RoleSelector({
  value,
  permissions,
  onChange,
  onPermissionsChange,
}: {
  value: string
  permissions: string[]
  onChange: (role: string) => void
  onPermissionsChange: (perms: string[]) => void
}) {
  const [customMode, setCustomMode] = useState(!isBuiltIn(value))
  const [customVal, setCustomVal]   = useState(isBuiltIn(value) ? "" : value)

  const isCustom = !isBuiltIn(value)

  return (
    <div className="space-y-3">
      {/* Built-in options */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {BUILT_IN_ROLES.map((r) => (
          <button
            key={r.id}
            onClick={() => { onChange(r.id); setCustomMode(false); onPermissionsChange([]) }}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all text-left ${
              value === r.id && !customMode
                ? r.activeColor
                : "bg-white border-slate-200 text-slate-700 hover:border-[#6b2fa5] hover:bg-purple-50"
            }`}
          >
            {r.icon}
            <div className="min-w-0">
              <p className="truncate">{r.label}</p>
              <p className={`text-xs font-normal truncate ${value === r.id && !customMode ? "opacity-80" : "text-slate-400"}`}>
                {r.description}
              </p>
            </div>
          </button>
        ))}
      </div>

      {/* Custom role toggle */}
      {!customMode ? (
        <button
          onClick={() => { setCustomMode(true); onChange(customVal || ""); onPermissionsChange([]) }}
          className="text-xs text-[#6b2fa5] font-medium hover:underline flex items-center gap-1"
        >
          <Plus size={12} /> Create custom role
        </button>
      ) : (
        <div className="space-y-3 border border-purple-200 bg-purple-50/50 rounded-xl p-4">
          <div className="flex items-center gap-2">
            <Settings size={14} className="text-[#6b2fa5]" />
            <span className="text-sm font-semibold text-[#6b2fa5]">Custom Role</span>
            <button
              onClick={() => { setCustomMode(false); onChange(BUILT_IN_ROLES[0].id); onPermissionsChange([]) }}
              className="ml-auto text-slate-400 hover:text-slate-600"
            >
              <X size={14} />
            </button>
          </div>

          {/* Role name */}
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1 block">Role name</label>
            <input
              value={customVal}
              onChange={(e) => { setCustomVal(e.target.value); onChange(e.target.value.trim()) }}
              placeholder="e.g. Photographer, Host, Stage Manager..."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6b2fa5]/30 focus:border-[#6b2fa5] bg-white"
            />
          </div>

          {/* Permission checklist */}
          {customVal.trim() && (
            <PermissionChecklist
              selected={permissions}
              onChange={onPermissionsChange}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ── Built-in role permissions info card ───────────────────────────────────────
function BuiltInPermissionsCard({ role }: { role: string }) {
  const cfg = getBuiltInConfig(role)
  if (!cfg) return null
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-3 text-sm">
      <p className="font-semibold text-slate-700 flex items-center gap-2">
        <Info size={14} className="text-slate-400" />
        {cfg.label} permissions
      </p>
      <div>
        <p className="text-xs text-slate-500 mb-1.5 font-medium uppercase tracking-wide">Can access</p>
        <div className="flex flex-wrap gap-1.5">
          {cfg.permissions.map((p) => (
            <span key={p} className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-2 py-0.5">
              <Check size={10} /> {ALL_PERMISSIONS.find((a) => a.id === p)?.label ?? p}
            </span>
          ))}
        </div>
      </div>
      {cfg.restricted.length > 0 && (
        <div>
          <p className="text-xs text-slate-500 mb-1.5 font-medium uppercase tracking-wide">No access</p>
          <div className="flex flex-wrap gap-1.5">
            {cfg.restricted.map((p) => (
              <span key={p} className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-500 border border-slate-200 rounded-full px-2 py-0.5">
                <X size={10} /> {p}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Add Collaborator Panel ────────────────────────────────────────────────────
function AddCollaboratorPanel({
  eventId,
  onAdded,
  onCancel,
}: {
  eventId: string
  onAdded: (collab: Collaborator) => void
  onCancel: () => void
}) {
  const [email, setEmail]               = useState("")
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookedUp, setLookedUp]         = useState<LookedUpUser | null>(null)
  const [lookupError, setLookupError]   = useState("")
  const [selectedRole, setSelectedRole] = useState("checkin")
  const [customPermissions, setCustomPermissions] = useState<string[]>([])
  const [saving, setSaving]             = useState(false)
  const [saveError, setSaveError]       = useState("")

  async function handleLookup() {
    if (!email.trim()) return
    setLookupLoading(true)
    setLookedUp(null)
    setLookupError("")
    try {
      const res = await fetch(
        `/api/whoru?type=email&value=${encodeURIComponent(email.trim().toLowerCase())}&limit=1`
      )
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setLookupError(d.error ?? "No Spotix account found with that email.")
        return
      }
      setLookedUp(await res.json())
    } catch {
      setLookupError("Network error. Please try again.")
    } finally {
      setLookupLoading(false)
    }
  }

  async function handleAdd() {
    if (!lookedUp) return
    if (!isBuiltIn(selectedRole) && customPermissions.length === 0) {
      setSaveError("Please select at least one permission for this custom role.")
      return
    }
    setSaving(true)
    setSaveError("")
    try {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          collaboratorEmail: email.trim().toLowerCase(),
          role: selectedRole,
          permissions: isBuiltIn(selectedRole) ? null : customPermissions,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setSaveError(data.error ?? "Failed to add collaborator."); return }
      onAdded({
        collaborationId: data.collaborationId,
        collaboratorId: data.collaboratorId,
        collaboratorEmail: email.trim().toLowerCase(),
        displayName: data.displayName,
        role: selectedRole,
        permissions: isBuiltIn(selectedRole) ? null : customPermissions,
        addedAt: new Date().toISOString(),
      })
    } catch {
      setSaveError("Network error. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-900 flex items-center gap-2">
          <UserPlus size={18} className="text-[#6b2fa5]" />
          Add Team Member
        </h3>
        <button onClick={onCancel} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors">
          <X size={16} />
        </button>
      </div>

      {/* Step 1: Email lookup */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-slate-700">Find by email</label>
        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setLookedUp(null); setLookupError("") }}
            onKeyDown={(e) => { if (e.key === "Enter") handleLookup() }}
            placeholder="teammate@example.com"
            className="flex-1 px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6b2fa5]/30 focus:border-[#6b2fa5]"
          />
          <button
            onClick={handleLookup}
            disabled={!email.trim() || lookupLoading}
            className="px-4 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {lookupLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            Find
          </button>
        </div>
        {lookupError && (
          <p className="text-sm text-red-600 flex items-center gap-1.5">
            <AlertCircle size={13} /> {lookupError}
          </p>
        )}
      </div>

      {/* Step 2: Confirm identity */}
      {lookedUp && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-green-200 flex items-center justify-center text-green-700 font-bold text-sm flex-shrink-0">
            {(lookedUp.fullName || lookedUp.username || "?").charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-900">{lookedUp.fullName || lookedUp.username}</p>
            <p className="text-xs text-slate-500 truncate">{lookedUp.email}</p>
          </div>
          <Check size={18} className="text-green-600 flex-shrink-0" />
        </div>
      )}

      {/* Step 3: Role + permissions */}
      {lookedUp && (
        <div className="space-y-3">
          <label className="text-sm font-semibold text-slate-700">Assign role</label>
          <RoleSelector
            value={selectedRole}
            permissions={customPermissions}
            onChange={setSelectedRole}
            onPermissionsChange={setCustomPermissions}
          />
          {isBuiltIn(selectedRole) && <BuiltInPermissionsCard role={selectedRole} />}
        </div>
      )}

      {saveError && (
        <p className="text-sm text-red-600 flex items-center gap-1.5">
          <AlertCircle size={13} /> {saveError}
        </p>
      )}

      {lookedUp && (
        <div className="flex gap-3 pt-1">
          <button onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleAdd} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-[#6b2fa5] text-white text-sm font-semibold hover:bg-[#5a2589] transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
            Add to Team
          </button>
        </div>
      )}
    </div>
  )
}

// ── Edit Role Panel ───────────────────────────────────────────────────────────
function EditRolePanel({
  collab,
  onSaved,
  onCancel,
}: {
  collab: Collaborator
  onSaved: (collaborationId: string, newRole: string, newPermissions: string[] | null) => void
  onCancel: () => void
}) {
  const [selectedRole, setSelectedRole]         = useState(collab.role)
  const [customPermissions, setCustomPermissions] = useState<string[]>(collab.permissions ?? [])
  const [saving, setSaving]                     = useState(false)
  const [error, setError]                       = useState("")

  async function handleSave() {
    if (!isBuiltIn(selectedRole) && customPermissions.length === 0) {
      setError("Please select at least one permission for this custom role.")
      return
    }
    setSaving(true)
    setError("")
    try {
      const res = await fetch("/api/teams", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collaborationId: collab.collaborationId,
          role: selectedRole,
          permissions: isBuiltIn(selectedRole) ? null : customPermissions,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? "Failed to update role."); return }
      onSaved(collab.collaborationId, selectedRole, isBuiltIn(selectedRole) ? null : customPermissions)
    } catch {
      setError("Network error.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-900 flex items-center gap-2">
          <Edit2 size={16} className="text-[#6b2fa5]" />
          Edit role — {collab.displayName}
        </h3>
        <button onClick={onCancel} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors">
          <X size={16} />
        </button>
      </div>
      <RoleSelector
        value={selectedRole}
        permissions={customPermissions}
        onChange={setSelectedRole}
        onPermissionsChange={setCustomPermissions}
      />
      {isBuiltIn(selectedRole) && <BuiltInPermissionsCard role={selectedRole} />}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3">
        <button onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
          Cancel
        </button>
        <button onClick={handleSave} disabled={saving}
          className="flex-1 py-2.5 rounded-xl bg-[#6b2fa5] text-white text-sm font-semibold hover:bg-[#5a2589] transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          Save Role
        </button>
      </div>
    </div>
  )
}

// ── Collaborator card ─────────────────────────────────────────────────────────
function CollaboratorCard({
  collab,
  onEdit,
  onRemove,
}: {
  collab: Collaborator
  onEdit: (c: Collaborator) => void
  onRemove: (collaborationId: string) => void
}) {
  const [removing, setRemoving] = useState(false)

  async function handleRemove() {
    if (!confirm(`Remove ${collab.displayName} from this event?`)) return
    setRemoving(true)
    try {
      const res = await fetch("/api/teams", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collaborationId: collab.collaborationId }),
      })
      if (res.ok) { onRemove(collab.collaborationId) }
      else {
        const d = await res.json().catch(() => ({}))
        alert(d.error ?? "Failed to remove collaborator.")
      }
    } catch { alert("Network error.") }
    finally { setRemoving(false) }
  }

  const permCount = collab.permissions ? collab.permissions.length : null

  return (
    <div className="flex items-center gap-3 p-4 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-colors group">
      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#6b2fa5] to-purple-400 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
        {(collab.displayName || collab.collaboratorEmail).charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-900 truncate">{collab.displayName}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <p className="text-xs text-slate-500 truncate">{collab.collaboratorEmail}</p>
          {permCount !== null && (
            <span className="text-xs text-purple-600 bg-purple-50 border border-purple-200 rounded-full px-1.5 py-0.5 flex-shrink-0">
              {permCount} tab{permCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <RoleBadge role={collab.role} />
        <button onClick={() => onEdit(collab)}
          className="p-1.5 text-slate-400 hover:text-[#6b2fa5] hover:bg-purple-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all" title="Change role">
          <Edit2 size={14} />
        </button>
        <button onClick={handleRemove} disabled={removing}
          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50" title="Remove">
          {removing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
        </button>
      </div>
    </div>
  )
}

// ── Right panel ───────────────────────────────────────────────────────────────
function EventTeamPanel({ event, onClose }: { event: OwnedEvent; onClose: () => void }) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([])
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState("")
  const [showAdd, setShowAdd]             = useState(false)
  const [editingCollab, setEditingCollab] = useState<Collaborator | null>(null)

  const fetchCollaborators = useCallback(async () => {
    setLoading(true); setError("")
    try {
      const res  = await fetch(`/api/teams?eventId=${event.id}&action=list`)
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? "Failed to load team."); return }
      setCollaborators(data.collaborators ?? [])
    } catch { setError("Network error loading team.") }
    finally { setLoading(false) }
  }, [event.id])

  useEffect(() => { fetchCollaborators() }, [fetchCollaborators])

  function handleAdded(collab: Collaborator) {
    setCollaborators((prev) => [collab, ...prev])
    setShowAdd(false)
  }

  function handleRoleUpdated(collaborationId: string, newRole: string, newPermissions: string[] | null) {
    setCollaborators((prev) =>
      prev.map((c) => c.collaborationId === collaborationId ? { ...c, role: newRole, permissions: newPermissions } : c)
    )
    setEditingCollab(null)
  }

  function handleRemoved(collaborationId: string) {
    setCollaborators((prev) => prev.filter((c) => c.collaborationId !== collaborationId))
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-slate-200 bg-gradient-to-r from-[#6b2fa5] to-purple-500 rounded-t-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-purple-200 text-xs font-semibold uppercase tracking-wide mb-1">Managing Team</p>
            <h2 className="text-white font-bold text-lg leading-tight truncate">{event.eventName}</h2>
            <p className="text-purple-200 text-sm mt-0.5 truncate">{event.eventVenue}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-purple-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors flex-shrink-0">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {showAdd && !editingCollab && (
          <div className="bg-purple-50 border border-purple-200 rounded-2xl p-5">
            <AddCollaboratorPanel eventId={event.id} onAdded={handleAdded} onCancel={() => setShowAdd(false)} />
          </div>
        )}

        {editingCollab && !showAdd && (
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
            <EditRolePanel
              collab={editingCollab}
              onSaved={handleRoleUpdated}
              onCancel={() => setEditingCollab(null)}
            />
          </div>
        )}

        {!showAdd && !editingCollab && (
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-900">Team Members</h3>
              <p className="text-xs text-slate-500 mt-0.5">{collaborators.length} {collaborators.length === 1 ? "member" : "members"}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={fetchCollaborators} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors" title="Refresh">
                <RefreshCw size={15} />
              </button>
              <button onClick={() => setShowAdd(true)}
                className="flex items-center gap-2 px-4 py-2 bg-[#6b2fa5] text-white rounded-xl text-sm font-semibold hover:bg-[#5a2589] transition-colors">
                <Plus size={14} /> Add Member
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={28} className="animate-spin text-[#6b2fa5]" />
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3">
            <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-700">Failed to load</p>
              <p className="text-sm text-red-600">{error}</p>
              <button onClick={fetchCollaborators} className="text-xs underline text-red-600 mt-1">Retry</button>
            </div>
          </div>
        ) : collaborators.length === 0 && !showAdd ? (
          <div className="text-center py-12 space-y-3">
            <div className="w-14 h-14 rounded-full bg-purple-50 border border-purple-200 flex items-center justify-center mx-auto">
              <Users size={24} className="text-purple-400" />
            </div>
            <div>
              <p className="font-semibold text-slate-700">No team members yet</p>
              <p className="text-sm text-slate-500 mt-1">Add collaborators to help manage this event.</p>
            </div>
            <button onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#6b2fa5] text-white rounded-xl text-sm font-semibold hover:bg-[#5a2589] transition-colors">
              <UserPlus size={14} /> Add First Member
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {collaborators.map((collab) => (
              <CollaboratorCard
                key={collab.collaborationId}
                collab={collab}
                onEdit={(c) => { setEditingCollab(c); setShowAdd(false) }}
                onRemove={handleRemoved}
              />
            ))}
          </div>
        )}

        {!showAdd && !editingCollab && (
          <div className="pt-2 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Role Reference</p>
            <div className="space-y-2">
              {BUILT_IN_ROLES.map((r) => (
                <div key={r.id} className="flex items-start gap-3 text-sm">
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-semibold flex-shrink-0 ${r.color}`}>
                    {r.icon} {r.label}
                  </span>
                  <span className="text-slate-500 text-xs leading-5">{r.description}</span>
                </div>
              ))}
              <div className="flex items-start gap-3 text-sm">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-semibold flex-shrink-0 bg-slate-50 text-slate-700 border-slate-200">
                  <Settings size={11} /> Custom
                </span>
                <span className="text-slate-500 text-xs leading-5">You choose exactly which tabs this person can see</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Inner page ────────────────────────────────────────────────────────────────
function TeamsPageInner() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const preselectedEventId = searchParams.get("eventId")

  const [authLoading, setAuthLoading]     = useState(true)
  const [collabEnabled, setCollabEnabled] = useState<boolean | null>(null)
  const [ownedEvents, setOwnedEvents]     = useState<OwnedEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [searchQuery, setSearchQuery]     = useState("")
  const [selectedEvent, setSelectedEvent] = useState<OwnedEvent | null>(null)

  useEffect(() => {
    const init = async () => {
      try {
        let token = getAccessToken()
        if (!token) {
          const refreshed = await tryRefreshTokens()
          if (!refreshed) { router.push("/login"); return }
        }
      } catch { router.push("/login"); return }

      const unsub = onAuthStateChanged(auth, async (user) => {
        if (!user) { router.push("/login"); return }
        setAuthLoading(false)
        await fetchUserProfile()
        await fetchOwnedEvents()
      })
      return () => unsub()
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function fetchUserProfile() {
    try {
      const res  = await fetch("/api/user/me")
      if (!res.ok) return
      const data = await res.json()
      setCollabEnabled(data.enabledCollaboration ?? false)
    } catch { setCollabEnabled(false) }
  }

  async function fetchOwnedEvents() {
    setEventsLoading(true)
    try {
      const res  = await fetch("/api/event/list?action=owned")
      if (!res.ok) return
      const data = await res.json()
      const events: OwnedEvent[] = (data.events ?? []).map((e: any) => ({
        id: e.id, eventName: e.eventName, status: e.status,
        eventDate: e.eventDate, eventVenue: e.eventVenue,
      }))
      setOwnedEvents(events)
      if (preselectedEventId) {
        const match = events.find((e) => e.id === preselectedEventId)
        if (match) setSelectedEvent(match)
      }
    } catch { /* non-critical */ }
    finally { setEventsLoading(false) }
  }

  const filteredEvents = ownedEvents.filter((e) =>
    e.eventName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.eventVenue.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-[#6b2fa5]" />
      </div>
    )
  }

  if (collabEnabled === false) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 p-6">
        <div className="max-w-lg mx-auto pt-20 text-center space-y-5">
          <div className="w-20 h-20 rounded-full bg-purple-50 border-2 border-purple-200 flex items-center justify-center mx-auto">
            <Users size={36} className="text-[#6b2fa5]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Collaboration is off</h1>
            <p className="text-slate-500 leading-relaxed">Enable collaboration in your Profile settings to start adding team members to your events.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/profile">
              <button className="px-6 py-2.5 bg-[#6b2fa5] text-white rounded-xl font-semibold hover:bg-[#5a2589] transition-colors">
                Go to Profile Settings
              </button>
            </Link>
            <Link href="/events">
              <button className="px-6 py-2.5 border border-slate-200 text-slate-700 rounded-xl font-semibold hover:bg-slate-50 transition-colors">
                Back to Events
              </button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50">
      <div className="max-w-6xl mx-auto p-6">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <Link href="/events">
              <button className="flex items-center gap-2 px-3 py-2 border border-slate-200 bg-white text-slate-600 rounded-lg hover:bg-slate-50 transition-colors text-sm">
                <ArrowLeft size={15} /> Events
              </button>
            </Link>
          </div>
          <div className="flex items-center gap-4 mt-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#6b2fa5] to-purple-400 flex items-center justify-center shadow-md">
              <Users size={22} className="text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Team Management</h1>
              <p className="text-slate-500 text-sm mt-0.5">Add collaborators and assign roles across your events</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left: event list */}
          <div className="lg:col-span-2">
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="p-4 border-b border-slate-100">
                <p className="text-sm font-semibold text-slate-700 mb-3">Your Events</p>
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search events..."
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6b2fa5]/30 focus:border-[#6b2fa5]"
                  />
                </div>
              </div>
              <div className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
                {eventsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 size={24} className="animate-spin text-[#6b2fa5]" />
                  </div>
                ) : filteredEvents.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <p className="text-sm">No events found</p>
                  </div>
                ) : (
                  filteredEvents.map((event) => (
                    <button key={event.id} onClick={() => setSelectedEvent(event)}
                      className={`w-full text-left p-4 flex items-center gap-3 transition-colors ${
                        selectedEvent?.id === event.id
                          ? "bg-purple-50 border-l-4 border-l-[#6b2fa5]"
                          : "hover:bg-slate-50 border-l-4 border-l-transparent"
                      }`}>
                      <StatusDot status={event.status} />
                      <div className="flex-1 min-w-0">
                        <p className={`font-semibold text-sm truncate ${selectedEvent?.id === event.id ? "text-[#6b2fa5]" : "text-slate-900"}`}>
                          {event.eventName}
                        </p>
                        <p className="text-xs text-slate-500 truncate mt-0.5">{event.eventVenue}</p>
                      </div>
                      <ChevronRight size={15} className={selectedEvent?.id === event.id ? "text-[#6b2fa5]" : "text-slate-300"} />
                    </button>
                  ))
                )}
              </div>
            </div>
            <div className="mt-3 flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
              <Crown size={13} className="flex-shrink-0 mt-0.5" />
              <span>Only event owners can add team members. Collaborators can exit teams from within the event page.</span>
            </div>
          </div>

          {/* Right: team panel */}
          <div className="lg:col-span-3">
            {selectedEvent ? (
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden" style={{ minHeight: "60vh" }}>
                <EventTeamPanel event={selectedEvent} onClose={() => setSelectedEvent(null)} />
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex items-center justify-center" style={{ minHeight: "60vh" }}>
                <div className="text-center space-y-3 p-8">
                  <div className="w-16 h-16 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center mx-auto">
                    <Users size={28} className="text-slate-300" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-500">Select an event</p>
                    <p className="text-sm text-slate-400 mt-1">Choose an event from the list to manage its team</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function TeamsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-[#6b2fa5]" />
      </div>
    }>
      <TeamsPageInner />
    </Suspense>
  )
}