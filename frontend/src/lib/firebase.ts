import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, Auth } from 'firebase/auth';

const isServer = typeof window === 'undefined';
const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim() || '';

// Only initialize Firebase when a real Web API key is present. Without a valid
// key, getAuth() throws `auth/invalid-api-key` at module load and takes down
// the whole app — so we degrade gracefully instead (guests can still chat).
const firebaseConfigured = Boolean(apiKey) && !apiKey.includes('DUMMY_KEY_FOR_SSG_PRERENDER') && apiKey.length > 20;

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let googleProvider: GoogleAuthProvider | null = null;

if (firebaseConfigured) {
  const firebaseConfig = {
    apiKey,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'ip-sakti-sih.firebaseapp.com',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'ip-sakti-sih',
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'ip-sakti-sih.appspot.com',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '111225573220',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:111225573220:web:d2b3c4e5f6a7b8c9d0e1f2'
  };
  app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  auth = getAuth(app);
  googleProvider = new GoogleAuthProvider();
}

export { app, auth, googleProvider, firebaseConfigured };