import { Suspense } from "react"
import AuthorizeClient from "./client"

export const metadata = {
  title: "Connect to Spotix Booker",
  robots: { index: false, follow: false },
}

export default function McpAuthorizePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0d0713] flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      }
    >
      <AuthorizeClient />
    </Suspense>
  )
}
