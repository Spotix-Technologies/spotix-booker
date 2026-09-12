"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import {
  LayoutDashboard,
  PlusCircle,
  CalendarDays,
  BarChart2,
  ShoppingBag,
  BadgeCheck,
  Vote,
  Landmark,
  KeyRound,
  LogIn,
  ChevronRight,
  ChevronLeft,
  X,
  Menu,
} from "lucide-react"
import { logout } from "@/lib/auth-client"
import { useAuth } from "@/hooks/useAuth"
import { LogoutDialog } from "@/components/logout-dialog"
import { NavUserMenu } from "@/components/nav-user-menu"

const NAV_ITEMS = [
  { href: "/dashboard",    label: "Dashboard",    icon: LayoutDashboard },
  { href: "/create-event", label: "Create Event", icon: PlusCircle      },
  { href: "/events",       label: "Events",       icon: CalendarDays    },
  { href: "/polls",        label: "Polls",        icon: Vote            },
  { href: "/elections",    label: "Elections",    icon: Landmark        },
  { href: "/reports",      label: "Reports",      icon: BarChart2       },
  { href: "/listings",     label: "My Store",     icon: ShoppingBag     },
  { href: "/verification", label: "Get Verified", icon: BadgeCheck      },
  { href: "/sdk/key/manage", label: "API Keys",   icon: KeyRound        },
]

// Width of the collapsed icon rail — also consumed by web-chrome.tsx to pad
// page content so it never sits under the fixed sidebar.
export const NAV_RAIL_WIDTH = "4rem"
// Width of the expanded rail (matches the `w-56` class below) — consumed by
// web-chrome.tsx so page content can push over in step with the rail instead
// of sitting underneath it.
export const NAV_RAIL_EXPANDED_WIDTH = "14rem"

interface NavProps {
  // Controlled desktop-rail expand state. When omitted, Nav manages it
  // internally (used by standalone pages that render <Nav /> without a
  // surrounding WebChrome). WebChrome passes these so it can push page
  // content over in step with the rail's own width transition.
  railExpanded?: boolean
  onRailExpandedChange?: (expanded: boolean) => void
}

export function Nav({ railExpanded: railExpandedProp, onRailExpandedChange }: NavProps = {}) {
  const pathname = usePathname()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen]             = useState(false)
  const [railExpandedState, setRailExpandedState] = useState(false)
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false)
  const railExpanded = railExpandedProp !== undefined ? railExpandedProp : railExpandedState
  const setRailExpanded = onRailExpandedChange ?? setRailExpandedState
  const { user, loading } = useAuth()
  const sidebarRef = useRef<HTMLDivElement>(null)
  const railRef = useRef<HTMLDivElement>(null)

  // Close the mobile drawer on outside click
  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (sidebarOpen && sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        setSidebarOpen(false)
      }
    }
    document.addEventListener("mousedown", onOutside)
    return () => document.removeEventListener("mousedown", onOutside)
  }, [sidebarOpen])

  // Collapse the expanded desktop rail on outside click
  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (railExpanded && railRef.current && !railRef.current.contains(e.target as Node)) {
        setRailExpanded(false)
      }
    }
    document.addEventListener("mousedown", onOutside)
    return () => document.removeEventListener("mousedown", onOutside)
  }, [railExpanded])

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? "hidden" : ""
    return () => { document.body.style.overflow = "" }
  }, [sidebarOpen])

  const handleLogoutComplete = async () => {
    setIsLogoutDialogOpen(false)
    setSidebarOpen(false)
    logout()
    router.push("/login")
  }

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === href : pathname.startsWith(href)

  if (!loading && !user) {
    // Signed-out visitors just get a slim top bar with a sign-in CTA.
    return (
      <header className="sticky top-0 z-40 h-14 flex items-center border-b border-slate-100 bg-white/90 backdrop-blur-xl px-4 sm:px-6 lg:px-8 shadow-sm shadow-black/[0.04]">
        <div className="flex w-full items-center justify-between max-w-screen-2xl mx-auto">
          <Link href="/login" className="flex items-center gap-2.5 group">
            <div className="relative w-8 h-8 rounded-lg overflow-hidden ring-1 ring-[#6b2fa5]/20 group-hover:ring-[#6b2fa5]/50 transition-all duration-200 group-hover:scale-105">
              <Image src="/logo.png" alt="Spotix" fill className="object-cover" priority />
            </div>
            <span className="hidden sm:block text-sm font-semibold text-slate-800 tracking-tight">
              Spotix <span className="text-[#6b2fa5]">Booker</span>
            </span>
          </Link>
          <Link
            href="/login"
            className="flex items-center gap-1.5 rounded-lg bg-[#6b2fa5] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[#5a2589] transition-colors shadow-sm"
          >
            <LogIn size={15} />
            Sign in
          </Link>
        </div>
      </header>
    )
  }

  return (
    <>
      {/* ─── Mobile top bar ──────────────────────────────────────────────── */}
      <header className="md:hidden sticky top-0 z-40 h-14 flex items-center border-b border-slate-100 bg-white/90 backdrop-blur-xl px-4 shadow-sm shadow-black/[0.04]">
        <div className="flex w-full items-center justify-between">
          <Link href={user ? "/dashboard" : "/login"} className="flex items-center gap-2.5">
            <div className="relative w-8 h-8 rounded-lg overflow-hidden ring-1 ring-[#6b2fa5]/20">
              <Image src="/logo.png" alt="Spotix" fill className="object-cover" priority />
            </div>
            <span className="text-sm font-semibold text-slate-800 tracking-tight">
              Spotix <span className="text-[#6b2fa5]">Booker</span>
            </span>
          </Link>
          {!loading && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex items-center justify-center w-9 h-9 rounded-lg text-slate-500 hover:text-[#6b2fa5] hover:bg-[#6b2fa5]/8 transition-colors"
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </button>
          )}
        </div>
      </header>

      {/* ─── Desktop left rail (icons-only collapsed, expands on toggle) ─── */}
      {!loading && (
        <aside
          ref={railRef}
          className={`
            hidden md:flex flex-col fixed inset-y-0 left-0 z-40
            bg-white border-r border-slate-100 shadow-sm shadow-black/[0.03]
            transition-all duration-200 ease-out
            ${railExpanded ? "w-56" : "w-16"}
          `}
        >
          {/* Logo */}
          <div className="h-14 flex items-center border-b border-slate-100 px-3 flex-shrink-0">
            <Link href="/dashboard" className="flex items-center gap-2.5 min-w-0">
              <div className="relative w-8 h-8 rounded-lg overflow-hidden ring-1 ring-[#6b2fa5]/20 flex-shrink-0">
                <Image src="/logo.png" alt="Spotix" fill className="object-cover" priority />
              </div>
              {railExpanded && (
                <span className="text-sm font-semibold text-slate-800 tracking-tight whitespace-nowrap overflow-hidden">
                  Spotix <span className="text-[#6b2fa5]">Booker</span>
                </span>
              )}
            </Link>
          </div>

          {/* Nav items */}
          <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-0.5" aria-label="Primary navigation">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const active = isActive(href)
              return (
                <Link
                  key={href}
                  href={href}
                  title={railExpanded ? undefined : label}
                  onClick={() => setRailExpanded(false)}
                  className={`
                    flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-sm font-medium
                    transition-colors whitespace-nowrap overflow-hidden
                    ${active
                      ? "bg-[#6b2fa5] text-white shadow-sm shadow-[#6b2fa5]/20"
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                    }
                  `}
                >
                  <Icon size={18} strokeWidth={active ? 2.2 : 1.8} className="flex-shrink-0" />
                  {railExpanded && <span className="flex-1">{label}</span>}
                  {railExpanded && active && <ChevronRight size={13} className="opacity-60" />}
                </Link>
              )
            })}
          </nav>

          {/* Expand/collapse toggle */}
          <button
            onClick={() => setRailExpanded(!railExpanded)}
            title={railExpanded ? "Collapse menu" : "Expand menu"}
            className="mx-2.5 mb-2 flex items-center justify-center gap-2 px-2.5 py-2 rounded-xl text-slate-400 hover:text-[#6b2fa5] hover:bg-[#6b2fa5]/8 transition-colors flex-shrink-0"
            aria-label={railExpanded ? "Collapse menu" : "Expand menu"}
          >
            {railExpanded ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
            {railExpanded && <span className="text-xs font-semibold">Collapse</span>}
          </button>

          {/* Footer: avatar + My Profile / Integrations / Logout */}
          <div className="px-2.5 py-2.5 border-t border-slate-100 flex-shrink-0">
            <NavUserMenu
              email={user?.email}
              fullName={user?.fullName}
              variant="rail"
              expanded={railExpanded}
              onRequestLogout={() => setIsLogoutDialogOpen(true)}
            />
          </div>
        </aside>
      )}

      {/* ─── Mobile drawer backdrop ──────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] md:hidden animate-in fade-in duration-200"
          aria-hidden="true"
        />
      )}

      {/* ─── Mobile drawer (slides in from left) ──────────────────────────── */}
      <aside
        ref={sidebarRef}
        className={`
          fixed top-0 left-0 z-50 h-full w-72 bg-white shadow-2xl shadow-black/20
          flex flex-col
          transform transition-transform duration-300 ease-out md:hidden
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <div className="flex items-center justify-between px-5 h-14 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="relative w-7 h-7 rounded-md overflow-hidden ring-1 ring-[#6b2fa5]/20">
              <Image src="/logo.png" alt="Spotix" fill className="object-cover" />
            </div>
            <span className="text-sm font-semibold text-slate-800 tracking-tight">
              Spotix <span className="text-[#6b2fa5]">Booker</span>
            </span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(href)
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setSidebarOpen(false)}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                  transition-all duration-150
                  ${active
                    ? "bg-[#6b2fa5] text-white shadow-sm shadow-[#6b2fa5]/25"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }
                `}
              >
                <Icon size={17} strokeWidth={active ? 2.2 : 1.8} className="flex-shrink-0" />
                <span className="flex-1">{label}</span>
                {active && <ChevronRight size={14} className="opacity-60 flex-shrink-0" />}
              </Link>
            )
          })}
        </nav>

        <div className="px-3 py-4 border-t border-slate-100 flex-shrink-0">
          <NavUserMenu
            email={user?.email}
            fullName={user?.fullName}
            variant="mobile"
            onNavigate={() => setSidebarOpen(false)}
            onRequestLogout={() => { setSidebarOpen(false); setIsLogoutDialogOpen(true) }}
          />
        </div>
      </aside>

      <LogoutDialog
        isOpen={isLogoutDialogOpen}
        onClose={() => setIsLogoutDialogOpen(false)}
        onLogoutComplete={handleLogoutComplete}
      />
    </>
  )
}
