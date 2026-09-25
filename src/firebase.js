import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set } from "firebase/database";
import {
  getAuth,
  setPersistence,
  browserSessionPersistence,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
};

// only initialize if configured -- lets the app still run locally without
// Firebase set up yet (falls back to local-only storage, see App.jsx)
export const firebaseEnabled = Boolean(firebaseConfig.databaseURL);

let db = null;
let auth = null;
if (firebaseEnabled) {
  const app = initializeApp(firebaseConfig);
  db = getDatabase(app);
  auth = getAuth(app);
}

export function subscribeToOverrides(path, callback) {
  if (!db) return () => {};
  const overridesRef = ref(db, path);
  const unsubscribe = onValue(overridesRef, (snapshot) => {
    callback(snapshot.val() || {});
  });
  return unsubscribe;
}

export function saveOverridesShared(path, overrides) {
  if (!db) return Promise.resolve();
  return set(ref(db, path), overrides);
}

// admin capability is enforced by Firebase (Security Rules require
// auth != null to write), not by anything the client can fake -- see
// database.rules.json. Session-only persistence so admin sign-in doesn't
// silently survive a browser restart on a shared machine.
export async function adminSignIn(email, password) {
  if (!auth) throw new Error("Firebase is niet geconfigureerd");
  await setPersistence(auth, browserSessionPersistence);
  await signInWithEmailAndPassword(auth, email, password);
}

export function adminSignOut() {
  if (!auth) return Promise.resolve();
  return signOut(auth);
}

export function subscribeToAdminAuth(callback) {
  if (!auth) return () => {};
  return onAuthStateChanged(auth, (user) => callback(Boolean(user)));
}
