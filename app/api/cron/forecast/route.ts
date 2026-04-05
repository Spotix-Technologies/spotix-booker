/**
 * app/api/cron/forecast/route.ts
 *
 * GET /api/cron/forecast — Populate weather forecasts for upcoming events
 *
 * ── Security ───────────────────────────────────────────────────────────────────
 *
 * This route must NEVER be callable by end users or arbitrary HTTP clients.
 * Three independent layers of protection are applied:
 *
 *   1. CRON_SECRET env var — Vercel Cron automatically injects
 *      `Authorization: Bearer <CRON_SECRET>` on every invocation. Any request
 *      missing a valid secret is rejected with 401 before any Firestore work.
 *
 *   2. vercel.json schedule — only Vercel's own cron infra will hit this path
 *      on the configured schedule. It is not reachable via the public Next.js
 *      router unless the caller also knows CRON_SECRET.
 *
 *   3. Middleware exclusion — /api/* is excluded from the Next.js middleware
 *      matcher, so this route bypasses the JWT auth gate (correct — crons have
 *      no user session) and relies solely on the CRON_SECRET check below.
 *
 * ── vercel.json entry required ────────────────────────────────────────────────
 *
 *   {
 *     "crons": [
 *       {
 *         "path": "/api/cron/forecast",
 *         "schedule": "0 6 * * *"   // runs daily at 06:00 UTC
 *       }
 *     ]
 *   }
 *
 * ── Required env vars ─────────────────────────────────────────────────────────
 *
 *   CRON_SECRET   — random secret, also set in Vercel dashboard under
 *                   Project → Settings → Cron Jobs → Secret
 *
 * ── What this job does ────────────────────────────────────────────────────────
 *
 *   1. Query forecasts where status == "pending" AND eventDate is within
 *      the next 5 days (Open-Meteo only provides 7-day forecasts with useful
 *      hourly resolution; querying too early wastes API calls).
 *
 *   2. For each pending forecast, call the Open-Meteo API with the event's
 *      lat/lng and event date to get hourly weather data.
 *
 *   3. Write the result back to forecasts/{eventId} with status="fulfilled"
 *      (or status="failed" with an error field if Open-Meteo errors).
 *
 * ── Firestore composite index required ────────────────────────────────────────
 *
 *   Collection : forecasts
 *   Fields     : status ASC, eventDate ASC
 *
 *   Add this to firestore.indexes.json — without it the compound query in
 *   step 1 will fail with a "requires an index" error.
 *
 * ── Open-Meteo API ────────────────────────────────────────────────────────────
 *
 *   Free, no API key required.
 *   Docs: https://open-meteo.com/en/docs
 *   Endpoint used:
 *     https://api.open-meteo.com/v1/forecast
 *       ?latitude={lat}
 *       &longitude={lng}
 *       &hourly=temperature_2m,precipitation_probability,weathercode,windspeed_10m
 *       &daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum
 *       &timezone=Africa%2FLagos
 *       &start_date={YYYY-MM-DD}
 *       &end_date={YYYY-MM-DD}
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Constants ──────────────────────────────────────────────────────────────────
const FORECAST_WINDOW_DAYS = 5;
const OPEN_METEO_BASE = "https://api.open-meteo.com/v1/forecast";
const DEV_TAG = "API developed and maintained by Spotix Technologies";

// ── Types ──────────────────────────────────────────────────────────────────────
interface ForecastDocument {
  eventId: string;
  eventDate: string;
  eventLocation: {
    lat: number | null;
    lng: number | null;
    city: string;
  };
  status: "pending" | "fulfilled" | "failed" | "skipped";
  createdAt: Timestamp;
}

interface OpenMeteoDaily {
  time: string[];
  weathercode: number[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  precipitation_sum: number[];
}

interface OpenMeteoResponse {
  daily: OpenMeteoDaily;
  daily_units: Record<string, string>;
  latitude: number;
  longitude: number;
}

// ── Security guard ─────────────────────────────────────────────────────────────
function isAuthorised(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    // Fail closed — if the secret isn't configured, reject everything.
    console.error("[cron/forecast] CRON_SECRET env var is not set. Rejecting all requests.");
    return false;
  }

  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;

  const provided = authHeader.slice(7);

  // Constant-time comparison to prevent timing attacks
  if (provided.length !== cronSecret.length) return false;
  let mismatch = 0;
  for (let i = 0; i < cronSecret.length; i++) {
    mismatch |= provided.charCodeAt(i) ^ cronSecret.charCodeAt(i);
  }
  return mismatch === 0;
}

// ── Date helpers ───────────────────────────────────────────────────────────────
function toISODate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

// ── Open-Meteo fetch ───────────────────────────────────────────────────────────
async function fetchForecast(
  lat: number,
  lng: number,
  eventDate: string
): Promise<OpenMeteoResponse> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    daily: "weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum",
    timezone: "Africa/Lagos",
    start_date: eventDate,
    end_date: eventDate,
  });

  const url = `${OPEN_METEO_BASE}?${params.toString()}`;
  const res = await fetch(url, { next: { revalidate: 0 } });

  if (!res.ok) {
    throw new Error(`Open-Meteo returned ${res.status}: ${await res.text()}`);
  }

  return res.json() as Promise<OpenMeteoResponse>;
}

// ── GET /api/cron/forecast ─────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  // ── Security: reject anything without a valid CRON_SECRET ───────────────────
  if (!isAuthorised(request)) {
    return NextResponse.json(
      { error: "Unauthorized", developer: DEV_TAG },
      { status: 401 }
    );
  }

  const now = new Date();
  const windowEnd = addDays(now, FORECAST_WINDOW_DAYS);
  const todayStr = toISODate(now);
  const windowEndStr = toISODate(windowEnd);

  console.log(
    `[cron/forecast] Running. Window: ${todayStr} → ${windowEndStr}`
  );

  // ── Query pending forecasts within the 5-day window ──────────────────────────
  // Requires composite index: forecasts [ status ASC, eventDate ASC ]
  let snap;
  try {
    snap = await adminDb
      .collection("forecasts")
      .where("status", "==", "pending")
      .where("eventDate", ">=", todayStr)
      .where("eventDate", "<=", windowEndStr)
      .get();
  } catch (queryErr: any) {
    console.error("[cron/forecast] Firestore query failed:", queryErr.message);
    return NextResponse.json(
      {
        error: "Database Error",
        message: "Forecast query failed — composite index may be missing",
        details: queryErr.message,
        developer: DEV_TAG,
      },
      { status: 500 }
    );
  }

  if (snap.empty) {
    console.log("[cron/forecast] No pending forecasts in window.");
    return NextResponse.json({
      success: true,
      message: "No pending forecasts in window",
      processed: 0,
      developer: DEV_TAG,
    });
  }

  // ── Process each forecast ────────────────────────────────────────────────────
  const results: Array<{
    eventId: string;
    status: "fulfilled" | "failed" | "skipped";
    reason?: string;
  }> = [];

  for (const doc of snap.docs) {
    const data = doc.data() as ForecastDocument;
    const { eventId, eventLocation, eventDate } = data;
    const ref = adminDb.collection("forecasts").doc(doc.id);

    // Skip if coordinates are missing — we can't call Open-Meteo without them
    if (eventLocation.lat === null || eventLocation.lng === null) {
      await ref.update({
        status: "skipped",
        skipReason: "Missing lat/lng coordinates",
        processedAt: FieldValue.serverTimestamp(),
      });
      results.push({ eventId, status: "skipped", reason: "Missing coordinates" });
      continue;
    }

    try {
      const forecast = await fetchForecast(
        eventLocation.lat,
        eventLocation.lng,
        eventDate
      );

      // Extract the single day's values (we queried start_date = end_date = eventDate)
      const daily = forecast.daily;
      const dayIndex = 0; // only one day returned

      await ref.update({
        status: "fulfilled",
        forecast: {
          weathercode: daily.weathercode[dayIndex] ?? null,
          tempMax: daily.temperature_2m_max[dayIndex] ?? null,
          tempMin: daily.temperature_2m_min[dayIndex] ?? null,
          precipitationMm: daily.precipitation_sum[dayIndex] ?? null,
          units: forecast.daily_units,
          resolvedCoordinates: {
            lat: forecast.latitude,
            lng: forecast.longitude,
          },
        },
        processedAt: FieldValue.serverTimestamp(),
      });

      results.push({ eventId, status: "fulfilled" });
      console.log(`[cron/forecast] ✅ Fulfilled forecast for eventId=${eventId}`);
    } catch (meteoErr: any) {
      console.error(
        `[cron/forecast] ❌ Open-Meteo failed for eventId=${eventId}:`,
        meteoErr.message
      );

      await ref.update({
        status: "failed",
        error: meteoErr.message,
        processedAt: FieldValue.serverTimestamp(),
      });

      results.push({ eventId, status: "failed", reason: meteoErr.message });
    }
  }

  const fulfilled = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const skipped = results.filter((r) => r.status === "skipped").length;

  console.log(
    `[cron/forecast] Done. fulfilled=${fulfilled} failed=${failed} skipped=${skipped}`
  );

  return NextResponse.json({
    success: true,
    message: "Forecast cron completed",
    summary: { total: results.length, fulfilled, failed, skipped },
    results,
    developer: DEV_TAG,
  });
}