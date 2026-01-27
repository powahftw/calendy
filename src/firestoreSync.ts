import { db } from './firebase';
import {
    doc,
    setDoc,
    onSnapshot,
    getDoc,
    serverTimestamp,
    DocumentData,
    FieldValue
} from 'firebase/firestore';
import { PlannerEvent, PlannerSettings } from './utils/calendarUtils';
import { logger } from './utils/logger';
import { getTimestampInMillis } from './utils/persistence';


export interface RemoteEventsPayload {
    events: PlannerEvent[];
    updatedAt: number | null;
}

// Debounce helper to avoid excessive writes
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 1000;

/**
 * Save events to Firestore (debounced)
 */
export const syncEvents = (uid: string, events: PlannerEvent[], timestamp?: number | FieldValue) => {
    if (!uid) return;

    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }

    saveTimeout = setTimeout(async () => {
        try {
            logger.info('Syncing Events to Firestore...', { count: events.length });
            const ref = doc(db, 'users', uid, 'data', 'events');
            await setDoc(ref, {
                events,
                updatedAt: timestamp || serverTimestamp()
            }, { merge: true });
            logger.info('Events synced to Firestore successfully');
        } catch (error) {
            logger.error('Error syncing events:', error);
        }
    }, DEBOUNCE_MS);
};

/**
 * Subscribe to events changes from Firestore
 * Returns an unsubscribe function
 */
export const subscribeToEvents = (uid: string, callback: (payload: RemoteEventsPayload) => void) => {
    if (!uid) return () => { };

    const ref = doc(db, 'users', uid, 'data', 'events');

    return onSnapshot(ref, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.data();
            const updatedAt = getTimestampInMillis(data.updatedAt);
            callback({ events: data.events || [], updatedAt });
        }
    }, (error) => {
        console.error('Error subscribing to events:', error);
    });
};

/**
 * Load initial events from Firestore
 */
export const loadEvents = async (uid: string): Promise<RemoteEventsPayload | null> => {
    if (!uid) return null;

    try {
        const ref = doc(db, 'users', uid, 'data', 'events');
        const snapshot = await getDoc(ref);

        if (snapshot.exists()) {
            const data = snapshot.data();
            const updatedAt = getTimestampInMillis(data.updatedAt);
            return { events: data.events || [], updatedAt };
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

export const syncSettings = (uid: string, settings: PlannerSettings, timestamp?: number | FieldValue) => {
    if (!uid) return;

    if (settingsSaveTimeout) {
        clearTimeout(settingsSaveTimeout);
    }

    settingsSaveTimeout = setTimeout(async () => {
        try {
            logger.info('Syncing Settings to Firestore...', settings);
            const ref = doc(db, 'users', uid, 'data', 'settings');
            await setDoc(ref, {
                ...settings,
                updatedAt: timestamp || serverTimestamp()
            }, { merge: true });
            logger.info('Settings synced to Firestore successfully');
        } catch (error) {
            logger.error('Error syncing settings:', error);
        }
    }, DEBOUNCE_MS);
};

/**
 * Subscribe to settings changes from Firestore
 * Returns an unsubscribe function
 */
export const subscribeToSettings = (uid: string, callback: (settings: Partial<PlannerSettings> & { updatedAt?: number }) => void) => {
    if (!uid) return () => { };

    const ref = doc(db, 'users', uid, 'data', 'settings');

    return onSnapshot(ref, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.data();
            const updatedAtMillis = getTimestampInMillis(data.updatedAt);
            callback({ ...data, updatedAt: updatedAtMillis || undefined });
        }
    }, (error) => {
        logger.error('Error subscribing to settings:', error);
    });
};

/**
 * Load initial settings from Firestore
 */
export const loadSettings = async (uid: string): Promise<(Partial<PlannerSettings> & { updatedAt?: number | null }) | null> => {
    if (!uid) return null;

    try {
        const ref = doc(db, 'users', uid, 'data', 'settings');
        const snapshot = await getDoc(ref);

        if (snapshot.exists()) {
            const data = snapshot.data();
            const updatedAt = getTimestampInMillis(data.updatedAt);
            return { ...(data as Partial<PlannerSettings>), updatedAt };
        }
        return null;
    } catch (error) {
        console.error('Error loading settings:', error);
        return null;
    }
};
