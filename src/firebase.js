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

// Firebase Realtime Database forbids ".", "#", "$", "/", "[", "]" in object
// keys, but the app uses advisor names (e.g. "Sven V.", "Tom H.") directly as
// keys everywhere. Transparently escape/unescape those characters right at
// the Firebase boundary so the rest of the app never has to know about it.
const FORBIDDEN_KEY_CHARS = /[.#$/[\]]/g;
const ESCAPED_KEY_CHARS = /~(\d+)~/g;

function escapeKey(key) {
  return key.replace(FORBIDDEN_KEY_CHARS, (ch) => `~${ch.charCodeAt(0)}~`);
}

function unescapeKey(key) {
  return key.replace(ESCAPED_KEY_CHARS, (_, code) => String.fromCharCode(Number(code)));
}

function mapTopLevelKeys(obj, mapKey) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
  const out = {};
  Object.entries(obj).forEach(([k, v]) => { out[mapKey(k)] = v; });
  return out;
}

export function subscribeToOverrides(path, callback) {
  if (!db) return () => {};
  const overridesRef = ref(db, path);
  const unsubscribe = onValue(overridesRef, (snapshot) => {
    callback(mapTopLevelKeys(snapshot.val(), unescapeKey) || {});
  });
  return unsubscribe;
}

export function saveOverridesShared(path, overrides) {
  if (!db) return Promise.resolve();
  return set(ref(db, path), mapTopLevelKeys(overrides, escapeKey));
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
