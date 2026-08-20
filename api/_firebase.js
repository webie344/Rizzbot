// api/_firebase.js
// Shared Firestore connection. Both webhook.js and match.js import this,
// so we only initialize the Firebase Admin app once.
//
// NOTE: filename starts with "_" so Vercel doesn't treat it as its own
// route — it's just a shared helper module.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore as _getFirestore } from "firebase-admin/firestore";

let dbInstance = null;

export function getFirestore() {
  if (dbInstance) return dbInstance;

  if (getApps().length === 0) {
    // FIREBASE_SERVICE_ACCOUNT_KEY should be the ENTIRE contents of the
    // service account JSON file you download from Firebase console,
    // pasted as a single-line string into the Vercel env var.
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

    initializeApp({
      credential: cert(serviceAccount),
    });
  }

  dbInstance = _getFirestore();
  return dbInstance;
}
