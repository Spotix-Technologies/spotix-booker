import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { AuthProvider } from "@/hooks/useAuth"
import "./globals.css"
import { Nav } from "@/components/nav"
import { Footer } from "@/components/footer"
// import "leaflet/dist/leaflet.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: {
    default: "Spotix Booker - Professional Event Management Platform",
    template: "%s | Spotix Booker",
  },
  description:
    "Create, manage, and grow your events with Spotix Booker. The all-in-one event planning platform for seamless ticketing, attendee management, and real-time analytics. Perfect for conferences, concerts, workshops, and more.",
  keywords: [
    "event management",
    "ticket booking",
    "event planning",
    "event ticketing",
    "spotix",
    "conference management",
    "event registration",
    "Nigeria events",
    "online ticketing",
  ],
  authors: [{ name: "Spotix" }],
  creator: "Spotix",
  publisher: "Spotix",
  metadataBase: new URL("https://booker.spotix.com.ng"),
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://booker.spotix.com.ng",
    siteName: "Spotix Booker",
    title: "Spotix Booker - Professional Event Management Platform",
    description:
      "Create, manage, and grow your events with Spotix Booker. The all-in-one event planning platform for seamless ticketing, attendee management, and real-time analytics.",
    images: [
      {
        url: "https://i.postimg.cc/FR5xpcpZ/hero.jpg",
        width: 1200,
        height: 630,
        alt: "Spotix Booker - Event Management Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Spotix Booker - Professional Event Management Platform",
    description:
      "Create, manage, and grow your events with Spotix Booker. Seamless ticketing, attendee management, and real-time analytics.",
    images: ["https://i.postimg.cc/FR5xpcpZ/hero.jpg"],
    creator: "@spotix.ng",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      { url: "/xmas.png", media: "(prefers-color-scheme: light)" },
      { url: "/xmas.png", media: "(prefers-color-scheme: dark)" },
      { url: "/xmas.png", type: "image/png" },
    ],
    apple: "/xmas.png",
  },
  verification: {
    // Add verification codes here when available
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <div className="min-h-screen flex flex-col">
        <AuthProvider>
          <Nav />
          {children}
          <Footer />
        </AuthProvider>
        </div>
      </body>
    </html>
  )
}
