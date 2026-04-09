import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const getAuthDomain = () => {
    const configuredAuthDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;

    if (typeof window === "undefined") {
        return configuredAuthDomain;
    }

    const { hostname } = window.location;
    const isFirebaseHostingDomain = hostname.endsWith(".web.app") || hostname.endsWith(".firebaseapp.com");

    return isFirebaseHostingDomain ? hostname : configuredAuthDomain;
};

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: getAuthDomain(),
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const isFirebaseConfigured = Object.values(firebaseConfig).every(
    (value) => typeof value === "string" && value.trim().length > 0
);

const app = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;

export { auth, db, isFirebaseConfigured };
