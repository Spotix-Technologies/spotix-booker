import admin from "firebase-admin"

if (!admin.apps.length) {
  const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  }

  // Validate that all required credentials are present
  if (!serviceAccount.projectId || !serviceAccount.privateKey || !serviceAccount.clientEmail) {
    console.warn("⚠️ Firebase Admin SDK not fully configured. Missing environment variables:")
    if (!serviceAccount.projectId) console.warn("  - FIREBASE_PROJECT_ID")
    if (!serviceAccount.privateKey) console.warn("  - FIREBASE_PRIVATE_KEY")
    if (!serviceAccount.clientEmail) console.warn("  - FIREBASE_CLIENT_EMAIL")
    console.warn("This may cause errors in auth endpoints that require Firebase Admin SDK.")
  } else {
    try {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount as any),
      })
    } catch (err) {
      console.error("Failed to initialize Firebase Admin SDK:", err)
    }
  }
}

export const adminDb = admin.apps.length > 0 ? admin.firestore() : (null as any)
export const adminAuth = admin.apps.length > 0 ? admin.auth() : (null as any)
