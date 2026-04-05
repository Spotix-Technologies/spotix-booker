/**
 * app/api/events/one/route.ts
 *
 * POST /api/events/one — Create a new event (authenticated bookers only)
 *
 * ── Auth ──────────────────────────────────────────────────────────────────────
 * Identity is read from the x-user-id / x-user-is-booker headers injected by
 * middleware after JWT verification. The request body NEVER supplies the userId
 * — doing so would let any caller impersonate another organiser.
 *
 * ── Firestore schema ──────────────────────────────────────────────────────────
 *
 *   events/{eventId}                ← flat collection, one doc per event
 *     organizerId   : string        ← uid from verified JWT (never from body)
 *     eventName     : string
 *     eventDescription : string
 *     eventImage    : string        ← first image (primary display)
 *     eventImages   : string[]      ← remaining images
 *     eventDate     : string        ← ISO date string (start date)
 *     eventEndDate  : string
 *     eventStart    : string        ← time string
 *     eventEnd      : string
 *     eventVenue    : string
 *     venueCoordinates : { lat, lng } | null
 *     eventType     : string
 *     isFree        : boolean
 *     ticketPrices  : TicketType[]
 *     hasStopDate   : boolean
 *     stopDate      : Timestamp | null
 *     enabledCollaboration : boolean
 *     allowAgents   : boolean
 *     affiliateId   : string | null
 *     affiliateName : string | null
 *     status        : "active" | "cancelled" | "completed"
 *     ticketsSold   : number
 *     revenue       : number
 *     createdAt     : Timestamp
 *
 *   forecasts/{eventId}             ← seeded here; populated by cron later
 *     eventId       : string
 *     eventDate     : string
 *     eventLocation : { lat, lng, city }
 *     status        : "pending"
 *     createdAt     : Timestamp
 *
 * ── Firestore composite indexes required ──────────────────────────────────────
 *
 *   Collection : events
 *   Fields     : organizerId ASC, createdAt DESC
 *   — for "my events" queries
 *
 *   Collection : events
 *   Fields     : status ASC, eventDate ASC
 *   — for public listing / filtering active events by date
 *
 *   Collection : forecasts
 *   Fields     : status ASC, eventDate ASC
 *   — for the cron job to pick up pending forecasts within 5 days
 *
 * Add all three to firestore.indexes.json.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAccessToken } from "@/lib/auth-tokens";
import { COOKIE_ACCESS_TOKEN } from "../../auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Shared helpers ─────────────────────────────────────────────────────────────
const DEV_TAG = "API developed and maintained by Spotix Technologies";

function ok<T extends object>(data: T, status = 200) {
  return NextResponse.json({ ...data, developer: DEV_TAG }, { status });
}

function err(error: string, message: string, status: number, details?: string) {
  return NextResponse.json(
    { error, message, ...(details ? { details } : {}), developer: DEV_TAG },
    { status }
  );
}

// ── Types ──────────────────────────────────────────────────────────────────────
interface TicketType {
  policy: string;
  price: number | string;
  quantity?: number;
}

interface VenueCoordinates {
  lat: number;
  lng: number;
}

// ── Auth helper — reusable across event routes ─────────────────────────────────
/**
 * Extract and verify the caller's identity.
 * Middleware injects x-user-id when the JWT is valid, so for page-initiated
 * requests the header is already present and we skip re-verification.
 * For direct API calls (e.g. from mobile / Fastify proxy) we fall back to
 * verifying the Bearer token ourselves.
 *
 * Returns { uid, isBooker } or null if unauthenticated.
 */
async function resolveIdentity(
  request: NextRequest
): Promise<{ uid: string; isBooker: boolean } | null> {
  // Fast path — header set by middleware (already verified)
  const headerUid = request.headers.get("x-user-id");
  const headerIsBooker = request.headers.get("x-user-is-booker");
  if (headerUid) {
    return { uid: headerUid, isBooker: headerIsBooker === "true" };
  }

  // Fallback — verify JWT ourselves (direct API call)
  const cookieToken = request.cookies.get(COOKIE_ACCESS_TOKEN)?.value;
  const bearerToken = request.headers.get("Authorization")?.replace("Bearer ", "");
  const token = cookieToken || bearerToken;
  if (!token) return null;

  try {
    const payload = await verifyAccessToken(token);
    return { uid: payload.uid, isBooker: payload.isBooker };
  } catch {
    return null;
  }
}

// ── POST /api/events ───────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  // ── 1. Authentication ────────────────────────────────────────────────────────
  const identity = await resolveIdentity(request);

  if (!identity) {
    return err("Unauthorized", "You must be logged in to create events", 401);
  }

  if (!identity.isBooker) {
    return err("Forbidden", "Only booker accounts can create events", 403);
  }

  const organizerId = identity.uid; // ← always from verified JWT, never from body

  // ── 2. Parse body ────────────────────────────────────────────────────────────
  let body: Record<string, any>;
  try {
    body = await request.json();
  } catch {
    return err("Bad Request", "Invalid JSON in request body", 400);
  }

  const {
    eventName,
    eventDescription,
    eventImages,
    eventDate,
    eventVenue,
    venueCoordinates = null,
    eventStart,
    eventEnd,
    eventEndDate,
    eventType,
    enablePricing,
    ticketPrices = [],
    enableStopDate = false,
    stopDate = null,
    enabledCollaboration = false,
    allowAgents = false,
    affiliateId = null,
    affiliateName = null,
  } = body;

  // ── 3. Validation ────────────────────────────────────────────────────────────

  // Required scalar fields
  if (!eventName?.trim()) {
    return err("Bad Request", "eventName is required", 400);
  }
  if (!eventDescription?.trim()) {
    return err("Bad Request", "eventDescription is required", 400);
  }
  if (!eventDate?.trim()) {
    return err("Bad Request", "eventDate is required", 400);
  }
  if (!eventVenue?.trim()) {
    return err("Bad Request", "eventVenue is required", 400);
  }
  if (!eventStart?.trim() || !eventEnd?.trim() || !eventEndDate?.trim()) {
    return err(
      "Bad Request",
      "eventStart, eventEnd, and eventEndDate are all required",
      400
    );
  }
  if (!eventType?.trim()) {
    return err("Bad Request", "eventType is required", 400);
  }

  // Images
  if (!Array.isArray(eventImages) || eventImages.length === 0) {
    return err("Bad Request", "At least one event image is required", 400);
  }

  // Venue coordinates shape
  if (
    venueCoordinates !== null &&
    venueCoordinates !== undefined &&
    (typeof venueCoordinates.lat !== "number" || typeof venueCoordinates.lng !== "number")
  ) {
    return err(
      "Bad Request",
      "venueCoordinates must be an object with numeric lat and lng fields",
      400
    );
  }

  // Pricing validation
  if (enablePricing) {
    if (!Array.isArray(ticketPrices) || ticketPrices.length === 0) {
      return err(
        "Bad Request",
        "ticketPrices are required when enablePricing is true",
        400
      );
    }

    for (let i = 0; i < ticketPrices.length; i++) {
      const ticket: TicketType = ticketPrices[i];
      if (!ticket.policy?.trim()) {
        return err(
          "Bad Request",
          `Ticket at index ${i} is missing a policy name`,
          400
        );
      }
      if (ticket.price === undefined || ticket.price === null || ticket.price === "") {
        return err(
          "Bad Request",
          `Ticket "${ticket.policy}" is missing a price (use 0 for free tickets)`,
          400
        );
      }
      const numericPrice = Number(ticket.price);
      if (isNaN(numericPrice) || numericPrice < 0) {
        return err(
          "Bad Request",
          `Ticket "${ticket.policy}" has an invalid price`,
          400
        );
      }
    }
  }

  // ── 4. Build event document ──────────────────────────────────────────────────
  const [primaryImage, ...additionalImages] = eventImages as string[];
  const isFree = !enablePricing;

  const eventDoc: Record<string, any> = {
    organizerId,               // from JWT — not from body
    eventName: eventName.trim(),
    eventDescription: eventDescription.trim(),
    eventImage: primaryImage,
    eventImages: additionalImages,
    eventDate,
    eventEndDate,
    eventStart,
    eventEnd,
    eventVenue: eventVenue.trim(),
    venueCoordinates: venueCoordinates ?? null,
    eventType,
    isFree,
    ticketPrices: enablePricing ? ticketPrices : [],
    enabledCollaboration,
    allowAgents: enabledCollaboration ? allowAgents : false,
    affiliateId: affiliateId ?? null,
    affiliateName: affiliateName ?? null,
    status: "active",
    ticketsSold: 0,
    revenue: 0,
    hasStopDate: enableStopDate && !!stopDate,
    stopDate: enableStopDate && stopDate ? new Date(stopDate) : null,
    createdAt: FieldValue.serverTimestamp(),
  };

  // ── 5. Write to Firestore — flat events collection ───────────────────────────
  const warnings: string[] = [];
  let eventId: string;

  try {
    const docRef = await adminDb.collection("events").add(eventDoc);
    eventId = docRef.id;
  } catch (firestoreErr: any) {
    console.error("Firestore event write failed:", firestoreErr);

    let message = "Unable to create event. Please try again.";
    if (firestoreErr.code === "permission-denied") {
      message = "Permission denied — check Firestore security rules";
    } else if (firestoreErr.code === "unavailable") {
      message = "Firestore is temporarily unavailable. Please retry.";
    }

    return err("Event Creation Failed", message, 500, firestoreErr.message);
  }

  // ── 6. Seed forecast document ────────────────────────────────────────────────
  /**
   * forecasts/{eventId} is seeded here with status="pending".
   * The /api/cron/forecast route picks up pending forecasts for events
   * occurring within the next 5 days and calls Open-Meteo to populate them.
   *
   * Required Firestore composite index:
   *   Collection: forecasts
   *   Fields: status ASC, eventDate ASC
   */
  try {
    // Derive a city label from the venue string as a best-effort seed value.
    // The cron job / geocoder will correct this with authoritative data later.
    const city = venueCoordinates
      ? eventVenue.trim().split(",").pop()?.trim() ?? eventVenue.trim()
      : eventVenue.trim();

    const forecastDoc: Record<string, any> = {
      eventId,
      eventDate,          // ISO string — cron filters on this
      eventLocation: {
        lat: venueCoordinates?.lat ?? null,
        lng: venueCoordinates?.lng ?? null,
        city,
      },
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
    };

    await adminDb.collection("forecasts").doc(eventId).set(forecastDoc);
  } catch (forecastErr: any) {
    // Non-fatal — the cron job can be re-triggered manually if needed
    console.error("Forecast seed failed for eventId", eventId, forecastErr);
    warnings.push("Weather forecast could not be initialised for this event");
  }

  // ── 7. Affiliate relationship ────────────────────────────────────────────────
  if (affiliateId) {
    try {
      const batch = adminDb.batch();

      const affiliateEventRef = adminDb
        .collection("Affiliates")
        .doc(affiliateId)
        .collection("affiliatedEvents")
        .doc(eventId);

      batch.set(affiliateEventRef, {
        organizerId,
        eventId,
        eventName: eventDoc.eventName,
        createdAt: FieldValue.serverTimestamp(),
      });

      batch.update(adminDb.collection("Affiliates").doc(affiliateId), {
        eventCount: FieldValue.increment(1),
      });

      await batch.commit();
    } catch (affiliateErr: any) {
      console.error("Affiliate relationship failed:", affiliateErr);
      warnings.push("Affiliate relationship could not be created");
    }
  }

  // ── 8. Analytics ─────────────────────────────────────────────────────────────
  try {
    // Use Intl API for correct WAT (UTC+1) date components
    const watFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Lagos",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = watFormatter.formatToParts(new Date());
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    const year = get("year");
    const month = `${year}-${get("month")}`;
    const day = `${month}-${get("day")}`;

    const analyticsPayload = {
      [isFree ? "freeEvents" : "paidEvents"]: FieldValue.increment(1),
      totalEvents: FieldValue.increment(1),
      lastUpdated: FieldValue.serverTimestamp(),
    };

    const analyticsBatch = adminDb.batch();
    const base = adminDb.collection("admin").doc("analytics");

    analyticsBatch.set(base.collection("daily").doc(day), analyticsPayload, { merge: true });
    analyticsBatch.set(base.collection("monthly").doc(month), analyticsPayload, { merge: true });
    analyticsBatch.set(base.collection("yearly").doc(year), analyticsPayload, { merge: true });

    await analyticsBatch.commit();
  } catch (analyticsErr) {
    console.error("Analytics update failed:", analyticsErr);
    warnings.push("Analytics could not be updated");
  }

  // ── 9. Success ───────────────────────────────────────────────────────────────
  return ok(
    {
      success: true,
      message: "Event created successfully",
      eventId,
      data: {
        eventName: eventDoc.eventName,
        eventType,
        isFree,
        eventDate,
        eventVenue: eventDoc.eventVenue,
        ticketTypesCount: enablePricing ? ticketPrices.length : 0,
      },
      ...(warnings.length > 0 ? { warnings } : {}),
    },
    201
  );
}