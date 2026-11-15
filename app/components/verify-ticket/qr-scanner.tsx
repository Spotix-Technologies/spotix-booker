"use client"

import { useEffect, useRef, useState } from "react"
import { ResponsiveSheet } from "@/components/ui/responsive-sheet"
import { Html5Qrcode } from "html5-qrcode"
import { BrowserMultiFormatReader } from "@zxing/library"

interface QrScannerProps {
  scannerLibrary: "html5qrcode" | "zxing"
  onClose: () => void
  onDetected: (decodedText: string) => void
}

export default function QrScanner({ scannerLibrary, onClose, onDetected }: QrScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const zxingScannerRef = useRef<BrowserMultiFormatReader | null>(null)
  const [error, setError] = useState<string>("")

  useEffect(() => {
    startScanning()

    return () => {
      stopScanning()
    }
  }, [scannerLibrary])

  const startScanning = () => {
    setError("")

    // The scanner container lives inside the sheet portal, which mounts a
    // frame after this component — wait for it to exist (max ~1s).
    const targetId = scannerLibrary === "zxing" ? "zxing-scanner-video" : "html5qrcode-scanner-div"
    let tries = 0
    const waitForTarget = () => {
      if (document.getElementById(targetId) || tries++ > 60) {
        if (scannerLibrary === "zxing") {
          startZxingScanner()
        } else {
          startHtml5QrCodeScanner()
        }
        return
      }
      requestAnimationFrame(waitForTarget)
    }
    setTimeout(waitForTarget, 100)
  }

  const startHtml5QrCodeScanner = () => {
    const html5QrCode = new Html5Qrcode("html5qrcode-scanner-div")
    scannerRef.current = html5QrCode

    html5QrCode
      .start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 220, height: 220 },
        },
        async (decodedText) => {
          try {
            await html5QrCode.stop()
            scannerRef.current = null
            onDetected(decodedText)
          } catch (err) {
            console.error("Error in QR code processing:", err)
          }
        },
        (errorMessage) => {
          console.log(`HTML5QRCode scanning error: ${errorMessage}`)
        },
      )
      .catch((err) => {
        console.error("Error starting HTML5QRCode scanner:", err)
        setError("Could not access camera. Please check permissions and try again.")
      })
  }

  const startZxingScanner = () => {
    const videoElement = document.getElementById("zxing-scanner-video") as HTMLVideoElement
    if (!videoElement) {
      setError("Video element not found")
      return
    }

    const codeReader = new BrowserMultiFormatReader()
    zxingScannerRef.current = codeReader

    codeReader
      .decodeFromVideoDevice(null, "zxing-scanner-video", (result, error) => {
        if (result) {
          try {
            codeReader.reset()
            zxingScannerRef.current = null
            onDetected(result.getText())
          } catch (err) {
            console.error("Error during zxing cleanup:", err)
          }
        }
        if (error && error.name !== "NotFoundException" && error.name !== "ChecksumException") {
          console.log(`ZXing scanning error: ${error}`)
        }
      })
      .catch((err) => {
        console.error("Error starting ZXing scanner:", err)
        setError("Could not access camera. Please check permissions and try again.")
      })
  }

  const stopScanning = () => {
    if (scannerRef.current) {
      scannerRef.current
        .stop()
        .then(() => {
          scannerRef.current = null
        })
        .catch(() => {
          scannerRef.current = null
        })
    } else if (zxingScannerRef.current) {
      try {
        zxingScannerRef.current.reset()
        zxingScannerRef.current = null
      } catch (err) {
        console.log("ZXing scanner was already stopped")
      }
    }
  }

  return (
    <ResponsiveSheet
      open
      onClose={onClose}
      size="md"
      title="Scan Spotix Ticket"
      fullHeightOnMobile
      zIndex={70}
    >
      <div className="space-y-6">
        {/* Scanner Container */}
        <div className="relative rounded-xl overflow-hidden bg-black shadow-inner">
          {scannerLibrary === "zxing" ? (
            <video
              id="zxing-scanner-video"
              className="w-full h-[50dvh] sm:h-80 object-cover"
            />
          ) : (
            <div id="html5qrcode-scanner-div" className="w-full h-[50dvh] sm:h-80" />
          )}

          {/* Scanner Frame Corners */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="relative w-56 h-56">
              {/* Top Left */}
              <div className="absolute top-0 left-0 w-12 h-12 border-l-4 border-t-4 border-[#6b2fa5] rounded-tl-lg"></div>
              {/* Top Right */}
              <div className="absolute top-0 right-0 w-12 h-12 border-r-4 border-t-4 border-[#6b2fa5] rounded-tr-lg"></div>
              {/* Bottom Left */}
              <div className="absolute bottom-0 left-0 w-12 h-12 border-l-4 border-b-4 border-[#6b2fa5] rounded-bl-lg"></div>
              {/* Bottom Right */}
              <div className="absolute bottom-0 right-0 w-12 h-12 border-r-4 border-b-4 border-[#6b2fa5] rounded-br-lg"></div>
            </div>
          </div>

          {/* Animated Scan Line */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="relative w-56 h-56 overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#6b2fa5] to-transparent animate-pulse shadow-lg shadow-[#6b2fa5]/50"></div>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="text-center space-y-2">
          <p className="text-sm text-gray-600 font-medium">
            Position the QR code within the frame
          </p>
          <p className="text-xs text-gray-500">
            The scanner will automatically detect the code
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-700 text-center font-medium">{error}</p>
          </div>
        )}
      </div>
    </ResponsiveSheet>
  )
}
