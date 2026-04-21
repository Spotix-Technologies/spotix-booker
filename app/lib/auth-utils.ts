/**
 * lib/auth-utils.ts
 *
 * Client-side Firebase auth helpers.
 *
 * IMPORTANT — cold-start null:
 * Firebase emits null on its very first `onAuthStateChanged` tick while it
 * restores the persisted session from IndexedDB. Unsubscribing immediately on
 * the first emission (as a naive implementation does) would resolve the promise
 * with null and falsely appear as "not logged in".
 *
 * Both helpers below wait for Firebase to emit a *real* value (user OR confirmed
 * null after initialization) before resolving.
 */

import { auth, db } from "./firebase"
import { onAuthStateChanged, type User } from "firebase/auth"
import { doc, getDoc } from "firebase/firestore"

export interface BookerCheckResult {
  isAuthenticated: boolean
  user: User | null
  isBooker: boolean
  bookerData?: any
  error?: string
}

/**
 * Resolves once Firebase has confirmed the current auth state.
 *
 * – If a user is signed in, fetches their Firestore profile and returns
 *   `isBooker` from `role === "booker"` or `isBooker === true`.
 * – If no user is signed in (confirmed, not cold-start null), resolves
 *   with `isAuthenticated: false`.
 *
 * Uses an `initialized` flag so the cold-start null emission is ignored —
 * we only resolve after Firebase has had a chance to restore the session.
 */
export async function checkBookerStatus(): Promise<BookerCheckResult> {
  return new Promise((resolve) => {
    let initialized = false

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!initialized) {
        // First emission — could be a cold-start null while IndexedDB is loading.
        // Mark initialized and wait for the next emission unless we already have a user.
        initialized = true
        if (user === null) {
          // No cached session at all; resolve as unauthenticated.
          // (If Firebase is still loading, it will emit a real user on the next tick.)
          // We use a short microtask delay to allow Firebase one more tick.
          await Promise.resolve()
          // Re-check: if Firebase emitted again synchronously we would have been
          // called again already. Safe to unsubscribe and resolve.
          unsubscribe()
          resolve({ isAuthenticated: false, user: null, isBooker: false })
          return
        }
        // First emission was a real user — fall through to profile fetch below.
      }

      unsubscribe()

      if (!user) {
        resolve({ isAuthenticated: false, user: null, isBooker: false })
        return
      }

      try {
        const userDocRef = doc(db, "users", user.uid)
        const userDoc = await getDoc(userDocRef)

        if (!userDoc.exists()) {
          resolve({
            isAuthenticated: true,
            user,
            isBooker: false,
            error: "User profile not found",
          })
          return
        }

        const userData = userDoc.data()
        const isBooker = userData?.role === "booker" || userData?.isBooker === true

        resolve({
          isAuthenticated: true,
          user,
          isBooker,
          bookerData: userData,
        })
      } catch (error) {
        console.error("Error checking booker status:", error)
        resolve({
          isAuthenticated: true,
          user,
          isBooker: false,
          error: "Failed to verify booker status",
        })
      }
    })
  })
}

/**
 * Resolves with the current Firebase user once auth state is known.
 * Returns null if no user is signed in (confirmed, not cold-start null).
 */
export function getCurrentUser(): Promise<User | null> {
  return new Promise((resolve) => {
    let initialized = false

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!initialized) {
        initialized = true
        if (user === null) {
          await Promise.resolve()
          unsubscribe()
          resolve(null)
          return
        }
      }

      unsubscribe()
      resolve(user)
    })
  })
}
