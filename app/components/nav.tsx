"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Menu, X, LogOut, LogIn } from "lucide-react"
import { useRouter } from "next/navigation"
import { logout } from "@/lib/auth-client"
import { useAuth } from "@/hooks/useAuth"
import { LogoutDialog } from "@/components/logout-dialog"

export function Nav() {
  const [isOpen, setIsOpen] = useState(false)
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false)
  const { user } = useAuth()
  const router = useRouter()

  const toggleMenu = () => setIsOpen((prev) => !prev)

  // Called by LogoutDialog after the server-side logout API succeeds.
  // Use our custom logout function which handles token cleanup and cache busting.
  const handleLogoutComplete = async () => {
    setIsLogoutDialogOpen(false)
    setIsOpen(false)
    // The logout function will clear access tokens, bust caches, and redirect to /login
    logout()
  }

  const navItems = [
    { href: "/dashboard", label: "Home" },
    { href: "/create-event", label: "Create Event" },
    { href: "/events", label: "Events" },
    { href: "/profile", label: "Profile" },
    { href: "/reports", label: "Reports" },
    { href: "/listings", label: "My Store" },
    { href: "/verification", label: "Apply for Verification" },
  ]

  return (
    <>
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-white/40 backdrop-blur-2xl backdrop-saturate-150 shadow-xl shadow-black/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Top bar */}
          <div className="flex h-16 items-center justify-between">
            {/* Logo */}
            <Link href="/dashboard" className="flex items-center gap-3 group">
              <div className="relative w-10 h-10 rounded-lg overflow-hidden shadow-md ring-2 ring-[#6b2fa5]/20 group-hover:ring-[#6b2fa5]/40 transition-all duration-300 group-hover:scale-110 group-hover:rotate-3">
                <Image src="/logo.png" alt="Spotix" fill className="object-cover" priority />
              </div>
              <span className="hidden sm:inline text-lg font-bold bg-gradient-to-r from-[#6b2fa5] via-[#8b3fc5] to-[#6b2fa5] bg-clip-text text-transparent">
                Spotix for Bookers
              </span>
            </Link>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-2">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="px-4 py-2 rounded-lg font-semibold text-slate-700 hover:text-[#6b2fa5] transition-colors"
                >
                  {item.label}
                </Link>
              ))}

              {user ? (
                <button
                  onClick={() => setIsLogoutDialogOpen(true)}
                  className="ml-2 flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-white font-semibold hover:bg-red-600 transition"
                >
                  <LogOut size={18} />
                  Logout
                </button>
              ) : (
                <Link
                  href="/login"
                  className="ml-2 flex items-center gap-2 rounded-lg bg-[#6b2fa5] px-4 py-2 text-white font-semibold hover:bg-purple-700 transition"
                >
                  <LogIn size={18} />
                  Login
                </Link>
              )}
            </div>

            {/* Mobile toggle */}
            <button
              onClick={toggleMenu}
              className="md:hidden p-2 rounded-lg text-[#6b2fa5] hover:bg-[#6b2fa5]/10 transition"
              aria-label="Toggle menu"
            >
              {isOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>

          {/* MOBILE MENU */}
          <div
            className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${
              isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
            } md:hidden`}
          >
            <div className="overflow-hidden">
              <div className="border-t pt-6 pb-6 space-y-3 max-h-[80vh] overflow-y-auto">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    className="block rounded-lg px-4 py-4 text-base font-semibold text-slate-700 hover:bg-[#6b2fa5]/10 hover:text-[#6b2fa5] transition"
                  >
                    {item.label}
                  </Link>
                ))}

                {user ? (
                  <button
                    onClick={() => {
                      setIsOpen(false)
                      setIsLogoutDialogOpen(true)
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-500 px-4 py-4 text-white font-semibold hover:bg-red-600 transition"
                  >
                    <LogOut size={18} />
                    Logout
                  </button>
                ) : (
                  <Link
                    href="/login"
                    onClick={() => setIsOpen(false)}
                    className="flex items-center justify-center gap-2 rounded-lg bg-[#6b2fa5] px-4 py-4 text-white font-semibold hover:bg-purple-700 transition"
                  >
                    <LogIn size={18} />
                    Login
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Logout Dialog — rendered outside nav so it's not clipped */}
      <LogoutDialog
        isOpen={isLogoutDialogOpen}
        onClose={() => setIsLogoutDialogOpen(false)}
        onLogoutComplete={handleLogoutComplete}
      />
    </>
  )
}
