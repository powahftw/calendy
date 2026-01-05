import { db } from './firebase';
import {
    doc,
    setDoc,
    onSnapshot,
    getDoc,
    serverTimestamp,
    DocumentData
} from 'firebase/firestore';
import { PlannerEvent, PlannerSettings } from './utils/calendarUtils';

// Debounce helper to avoid excessive writes
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 1000;

/**
 * Save events to Firestore (debounced)
 */
export const syncEvents = (uid: string, events: PlannerEvent[]) => {
    if (!uid) return;

    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }

    saveTimeout = setTimeout(async () => {
        try {
            const ref = doc(db, 'users', uid, 'data', 'events');
            await setDoc(ref, {
                events,
                updatedAt: serverTimestamp()
            }, { merge: true });
            console.log('Events synced to Firestore');
        } catch (error) {
            console.error('Error syncing events:', error);
        }
    }, DEBOUNCE_MS);
};

/**
 * Subscribe to events changes from Firestore
 * Returns an unsubscribe function
 */
export const subscribeToEvents = (uid: string, callback: (events: PlannerEvent[]) => void) => {
    if (!uid) return () => { };

    const ref = doc(db, 'users', uid, 'data', 'events');

    return onSnapshot(ref, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.data();
            callback(data.events || []);
        }
    }, (error) => {
        console.error('Error subscribing to events:', error);
    });
};

/**
 * Load initial events from Firestore
 */
export const loadEvents = async (uid: string): Promise<PlannerEvent[] | null> => {
    if (!uid) return null;

    try {
        const ref = doc(db, 'users', uid, 'data', 'events');
        const snapshot = await getDoc(ref);

        if (snapshot.exists()) {
            return snapshot.data().events || [];
        }
        return null;
    } catch (error) {
        console.error('Error loading events:', error);
        return null;
    }
};

/**
 * Save settings to Firestore (debounced)
 */
let settingsSaveTimeout: ReturnType<typeof setTimeout> | null = null;

export const syncSettings = (uid: string, settings: PlannerSettings) => {
    if (!uid) return;

    if (settingsSaveTimeout) {
        clearTimeout(settingsSaveTimeout);
    }

    settingsSaveTimeout = setTimeout(async () => {
        try {
            const ref = doc(db, 'users', uid, 'data', 'settings');
            await setDoc(ref, {
                ...settings,
                updatedAt: serverTimestamp()
            }, { merge: true });
            console.log('Settings synced to Firestore');
        } catch (error) {
            console.error('Error syncing settings:', error);
        }
    }, DEBOUNCE_MS);
};

/**
 * Subscribe to settings changes from Firestore
 * Returns an unsubscribe function
 */
export const subscribeToSettings = (uid: string, callback: (settings: Partial<PlannerSettings>) => void) => {
    if (!uid) return () => { };

    const ref = doc(db, 'users', uid, 'data', 'settings');

    return onSnapshot(ref, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.data();
            // Remove updatedAt from callback data
            const { updatedAt: _updatedAt, ...settings } = data as DocumentData;
            callback(settings as Partial<PlannerSettings>);
        }
    }, (error) => {
        console.error('Error subscribing to settings:', error);
    });
};

/**
 * Load initial settings from Firestore
 */
export const loadSettings = async (uid: string): Promise<Partial<PlannerSettings> | null> => {
    if (!uid) return null;

    try {
        const ref = doc(db, 'users', uid, 'data', 'settings');
        const snapshot = await getDoc(ref);

        if (snapshot.exists()) {
            const { updatedAt: _updatedAt, ...settings } = snapshot.data() as DocumentData;
            return settings as Partial<PlannerSettings>;
        }
        return null;
    } catch (error) {
        console.error('Error loading settings:', error);
        return null;
    }
};
