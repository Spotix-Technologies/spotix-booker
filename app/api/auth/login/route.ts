/**
 * app/api/auth/login/route.ts
 *
 * POST /api/auth/login  — Email/password login endpoint
 *
 * Accepts email and password directly (no Firebase Client SDK needed).
 * Uses Firebase Admin SDK + the Firebase REST API to authenticate,
 * then issues our access + refresh tokens.
 */

import { NextRequest, NextResponse } from "next/server"
import { adminAuth, adminDb } from "@/lib/firebase-admin"
import {
  signAccessToken,
  newDeviceId,
  type DeviceMeta,
} from "@/lib/auth-tokens"
import {
  revokeActiveTokensForDevice,
  issueRefreshToken,
} from "@/lib/refresh-token-repo"
import {
  COOKIE_ACCESS_TOKEN,
  COOKIE_REFRESH_TOKEN,
  COOKIE_REFRESH_TOKEN_ID,
  setAuthCookies,
} from "../route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const DEV_TAG = "API developed and maintained by Spotix Technologies"

function ok<T extends object>(data: T, status = 200) {
  return NextResponse.json({ ...data, developer: DEV_TAG }, { status })
}

function err(error: string, message: string, status: number, details?: string) {
  return NextResponse.json(
    { error, message, ...(details ? { details } : {}), developer: DEV_TAG },
    { status }
  )
}

export async function POST(request: NextRequest) {
  try {
    const { email, password, deviceId, deviceMeta } = await request.json()

    // Validate inputs
    if (!email || !password) {
      return err("INVALID_INPUT", "Email and password are required", 400)
    }

    if (!deviceId || !deviceMeta) {
      return err("INVALID_INPUT", "Device information is required", 400)
    }

    // Step 1: Verify email/password via Firebase REST API
    const firebaseApiKey = process.env.FIREBASE_API_KEY
    if (!firebaseApiKey) {
      console.error("Missing FIREBASE_API_KEY environment variable")
      return err("SERVER_ERROR", "Authentication service misconfigured", 500)
    }

    let userId: string
    try {
      const firebaseResponse = await fetch(
        "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" +
          firebaseApiKey,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, returnSecureToken: true }),
        }
      )

      if (!firebaseResponse.ok) {
        const firebaseError = await firebaseResponse.json()
        console.warn("Firebase login failed:", firebaseError)

        const msg: string = firebaseError.error?.message ?? ""
        if (msg.includes("INVALID_LOGIN_CREDENTIALS") || msg.includes("INVALID_PASSWORD") || msg.includes("EMAIL_NOT_FOUND")) {
          return err("INVALID_CREDENTIALS", "Incorrect email or password", 401)
        }
        if (msg.includes("USER_DISABLED")) {
          return err("USER_DISABLED", "This account has been disabled", 403)
        }
        if (msg.includes("TOO_MANY_ATTEMPTS_TRY_LATER")) {
          return err("TOO_MANY_REQUESTS", "Too many failed login attempts. Please try again later", 429)
        }
        return err("AUTH_FAILED", msg || "Authentication failed", 401)
      }

      const firebaseData = await firebaseResponse.json()
      userId = firebaseData.localId
    } catch (firebaseErr) {
      console.error("Firebase authentication error:", firebaseErr)
      return err("SERVER_ERROR", "Failed to authenticate with Firebase", 500)
    }

    // Step 2: Fetch user document to check if they're a booker
    let userData: any
    try {
      const userDoc = await adminDb.collection("users").doc(userId).get()
      if (!userDoc.exists) {
        return err("USER_NOT_FOUND", "User profile not found", 404)
      }
      userData = userDoc.data()
    } catch (dbErr) {
      console.error("Database error:", dbErr)
      return err("SERVER_ERROR", "Failed to load user profile", 500)
    }

    // Step 3: Revoke any existing tokens for this device
    try {
      await revokeActiveTokensForDevice(userId, deviceId)
    } catch (revokeErr) {
      console.warn("Failed to revoke previous device tokens:", revokeErr)
      // Non-fatal — continue
    }

    // Step 4: Issue new access and refresh tokens
    let accessToken: string
    let refreshTokenRecord: { token: string; id: string }

    try {
      const deviceMeta_: DeviceMeta = deviceMeta as DeviceMeta

      accessToken = await signAccessToken(
        {
          uid: userId,
          email: userData.email || email,
          isBooker: userData.isBooker ?? userData.role === "booker",
          deviceId,
        },
        "spotix-booker"
      )

      const issued = await issueRefreshToken(userId, deviceId, deviceMeta_)
      refreshTokenRecord = { token: issued.rawToken, id: issued.tokenId }
    } catch (tokenErr) {
      console.error("Token generation error:", tokenErr)
      return err("SERVER_ERROR", "Failed to generate authentication tokens", 500)
    }

    // Step 5: Build response with cookies and body
    const response = ok(
      {
        user: {
          uid: userId,
          email: userData.email || email,
          fullName: userData.fullName || "",
          isBooker: userData.isBooker || userData.role === "booker",
          profilePicture: userData.profilePicture || "/placeholder.svg",
        },
        accessToken,
        message: "Login successful",
      },
      200
    )

    setAuthCookies(response, accessToken, refreshTokenRecord.token, refreshTokenRecord.id)

    return response
  } catch (caughtErr) {
    console.error("Login endpoint error:", caughtErr)
    return err("SERVER_ERROR", "An unexpected error occurred during login", 500)
  }
}
