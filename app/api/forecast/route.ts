import { NextRequest, NextResponse } from "next/server"
import { adminDb } from "@/lib/firebase-admin"

/**
 * GET /api/forecast?eventId=<id>
 *
 * Fetches the weather forecast from Firestore: forecasts/{eventId}
 */
export async function GET(req: NextRequest) {
  try {
    const eventId = req.nextUrl.searchParams.get("eventId")
    if (!eventId) {
      return NextResponse.json(
        { error: "Missing required query parameter: eventId" },
        { status: 400 }
      )
    }

    // Fetch from forecasts collection
    const docRef = adminDb.collection("forecasts").doc(eventId)
    const docSnap = await docRef.get()

    if (!docSnap.exists) {
      return NextResponse.json(
        {
          status: "pending",
          forecast: null,
          processedAt: null,
          skipReason: null,
          error: null,
          eventLocation: null,
          eventDate: null,
        },
        { status: 200 }
      )
    }

    const data = docSnap.data()

    // Transform Firestore data to match ForecastData interface
    const response = {
      status: data.status || "pending",
      forecast: data.forecast
        ? {
            weathercode: data.forecast.weathercode,
            tempMax: data.forecast.tempMax,
            tempMin: data.forecast.tempMin,
            precipitationMm: data.forecast.precipitationMm,
            units: data.units,
            resolvedCoordinates: data.resolvedCoordinates,
          }
        : null,
      processedAt: data.processedAt ? new Date(data.processedAt).toISOString() : null,
      skipReason: data.skipReason || null,
      error: data.error || null,
      eventLocation: data.eventLocation
        ? {
            lat: data.eventLocation.lat || null,
            lng: data.eventLocation.lng || null,
            city: data.eventLocation.city || "",
          }
        : null,
      eventDate: data.eventDate || null,
    }

    return NextResponse.json(response, { status: 200 })
  } catch (err: any) {
    console.error("[GET /api/forecast]", err)
    return NextResponse.json(
      { error: "Failed to fetch forecast", details: err.message },
      { status: 500 }
    )
  }
}
