import { NextRequest, NextResponse } from "next/server"
import { adminDb } from "@/lib/firebase-admin"

// GET /api/payout?eventId=xxx
// Returns all daily transaction dates for the event from admin/events/{eventId}/{YYYY-MM-DD}
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const eventId = searchParams.get("eventId")

    if (!eventId) {
      return NextResponse.json({ error: "Missing eventId parameter" }, { status: 400 })
    }

    const salesCollectionRef = adminDb
      .collection("admin")
      .doc("events")
      .collection(eventId)

    const snapshot = await salesCollectionRef.orderBy("createdAt", "asc").get()

    if (snapshot.empty) {
      return NextResponse.json({ transactions: [] }, { status: 200 })
    }

    const transactions = snapshot.docs.map((doc) => ({
      date: doc.id, // YYYY-MM-DD
      ...doc.data(),
    }))

    return NextResponse.json({ transactions }, { status: 200 })
  } catch (error: any) {
    console.error("GET /api/payout error:", error)
    return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 })
  }
}

// POST /api/payout
// Body: { payId, eventId, date, ticketCount, ticketSales }
// Creates a payQueue/{payId}/{txnId} document
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { payId, eventId, date, ticketCount, ticketSales } = body

    if (!payId || !eventId || !date || ticketCount === undefined || ticketSales === undefined) {
      return NextResponse.json(
        { error: "Missing required fields: payId, eventId, date, ticketCount, ticketSales" },
        { status: 400 }
      )
    }

    // Verify the date record exists and get the lastPurchaseTime to enforce 2-day rule server-side
    const salesDocRef = adminDb
      .collection("admin")
      .doc("events")
      .collection(eventId)
      .doc(date)

    const salesDoc = await salesDocRef.get()

    if (!salesDoc.exists) {
      return NextResponse.json({ error: "Transaction date record not found" }, { status: 404 })
    }

    const salesData = salesDoc.data()!

    // Reconstruct the last purchase datetime from the date + lastPurchaseTime
    // lastPurchaseTime is stored as a locale time string; we combine with the date for comparison
    const lastPurchaseDatetime = new Date(`${date}T00:00:00`)
    // Use updatedAt (ISO string) if available for precision
    const updatedAt = salesData.updatedAt ? new Date(salesData.updatedAt) : lastPurchaseDatetime

    const now = new Date()
    const diffMs = now.getTime() - updatedAt.getTime()
    const diffDays = diffMs / (1000 * 60 * 60 * 24)

    if (diffDays < 2) {
      return NextResponse.json(
        {
          error: "Withdrawal not yet available. Payouts can only be requested 2 days after the last ticket purchase.",
        },
        { status: 403 }
      )
    }

    const timestamp = Date.now()
    const txnId = `SPTX-TXN-${timestamp}`

    const payQueueRef = adminDb
      .collection("payQueue")
      .doc(payId)
      .collection("transactions")
      .doc(txnId)

    await payQueueRef.set({
      txnId,
      eventId,
      date,
      ticketCount,
      ticketSales,
      status: "pending",
      createdAt: new Date().toISOString(),
    })

    return NextResponse.json({ success: true, txnId }, { status: 200 })
  } catch (error: any) {
    console.error("POST /api/payout error:", error)
    return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 })
  }
}

// Reject all other methods
export async function PUT() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 })
}
export async function DELETE() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 })
}
export async function PATCH() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 })
}