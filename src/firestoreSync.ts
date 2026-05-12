import { db } from './firebase';
import {
    doc,
    setDoc,
    onSnapshot,
    getDoc,
    serverTimestamp,
    FieldValue
} from 'firebase/firestore';
import { PlannerEvent, PlannerSettings } from './utils/calendarUtils';
import { logger } from './utils/logger';
import { getTimestampInMillis } from './utils/persistence';
import type { GoogleSyncSettings } from './utils/googleCalendarSync';


export interface RemoteEventsPayload {
    events: PlannerEvent[];
    updatedAt: number | null;
}

const SETTINGS_FIELDS = [
    'theme',
    'highlightToday',
    'showWeekends',
    'showDayProgress',
    'weekdayAlign',
    'year',
    'startMonth',
    'monthsToShow'
] as const;

const toPlannerSettings = (data: Record<string, unknown>): Partial<PlannerSettings> => {
    // Google sync settings live in the same Firestore document but are loaded separately.
    const settings: Partial<PlannerSettings> = {};

    for (const key of SETTINGS_FIELDS) {
        if (key in data) {
            (settings as Record<string, unknown>)[key] = data[key];
        }
    }

    return settings;
};

const isGoogleSyncSettings = (value: unknown): value is GoogleSyncSettings => {
    if (!value || typeof value !== 'object') return false;

    const settings = value as Record<string, unknown>;
    return typeof settings.enabled === 'boolean'
        && typeof settings.calendarId === 'string'
        && typeof settings.syncToken === 'string'
        && typeof settings.lastSyncedAt === 'number';
};

/**
 * Save events to Firestore.
 */
export const syncEvents = async (uid: string, events: PlannerEvent[], timestamp?: number | FieldValue): Promise<boolean> => {
    const firestore = db;
    if (!uid || !firestore) return false;

    try {
        logger.info('Syncing Events to Firestore...', { count: events.length });
        const ref = doc(firestore, 'users', uid, 'data', 'events');
        await setDoc(ref, {
            events,
            updatedAt: timestamp || serverTimestamp()
        }, { merge: true });
        logger.info('Events synced to Firestore successfully');
        return true;
    } catch (error) {
        logger.error('Error syncing events:', error);
        return false;
    }
};

/**
 * Subscribe to events changes from Firestore
 * Returns an unsubscribe function
 */
export const subscribeToEvents = (uid: string, callback: (payload: RemoteEventsPayload) => void) => {
    const firestore = db;
    if (!uid || !firestore) return () => { };

    const ref = doc(firestore, 'users', uid, 'data', 'events');

    return onSnapshot(ref, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.data();
            const updatedAt = getTimestampInMillis(data.updatedAt);
            callback({ events: data.events || [], updatedAt });
        }
    }, (error) => {
        logger.error('Error subscribing to events:', error);
    });
};

/**
 * Load initial events from Firestore
 */
export const loadEvents = async (uid: string): Promise<RemoteEventsPayload | null> => {
    const firestore = db;
    if (!uid || !firestore) return null;

    try {
        const ref = doc(firestore, 'users', uid, 'data', 'events');
        const snapshot = await getDoc(ref);

        if (snapshot.exists()) {
            const data = snapshot.data();
            const updatedAt = getTimestampInMillis(data.updatedAt);
            return { events: data.events || [], updatedAt };
        }
        return null;
    } catch (error) {
        logger.error('Error loading events:', error);
        return null;
    }
};

export const syncSettings = async (uid: string, settings: PlannerSettings, timestamp?: number | FieldValue): Promise<boolean> => {
    const firestore = db;
    if (!uid || !firestore) return false;

    try {
        logger.info('Syncing Settings to Firestore...', settings);
        const ref = doc(firestore, 'users', uid, 'data', 'settings');
        await setDoc(ref, {
            ...settings,
            updatedAt: timestamp || serverTimestamp()
        }, { merge: true });
        logger.info('Settings synced to Firestore successfully');
        return true;
    } catch (error) {
        logger.error('Error syncing settings:', error);
        return false;
    }
};

/**
 * Subscribe to settings changes from Firestore
 * Returns an unsubscribe function
 */
export const subscribeToSettings = (uid: string, callback: (settings: Partial<PlannerSettings> & { updatedAt?: number }) => void) => {
    const firestore = db;
    if (!uid || !firestore) return () => { };

    const ref = doc(firestore, 'users', uid, 'data', 'settings');

    return onSnapshot(ref, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.data();
            const updatedAtMillis = getTimestampInMillis(data.updatedAt);
            callback({ ...toPlannerSettings(data), updatedAt: updatedAtMillis || undefined });
        }
    }, (error) => {
        logger.error('Error subscribing to settings:', error);
    });
};

/**
 * Load initial settings from Firestore
 */
export const loadSettings = async (uid: string): Promise<(Partial<PlannerSettings> & { updatedAt?: number | null }) | null> => {
    const firestore = db;
    if (!uid || !firestore) return null;

    try {
        const ref = doc(firestore, 'users', uid, 'data', 'settings');
        const snapshot = await getDoc(ref);

        if (snapshot.exists()) {
            const data = snapshot.data();
            const updatedAt = getTimestampInMillis(data.updatedAt);
            return { ...toPlannerSettings(data), updatedAt };
        }
        return null;
    } catch (error) {
        logger.error('Error loading settings:', error);
        return null;
    }
};

export const loadGoogleSyncSettings = async (uid: string): Promise<GoogleSyncSettings | null> => {
    const firestore = db;
    if (!uid || !firestore) return null;

    try {
        const ref = doc(firestore, 'users', uid, 'data', 'settings');
        const snapshot = await getDoc(ref);
        if (!snapshot.exists()) return null;

        const data = snapshot.data();
        return isGoogleSyncSettings(data.googleSyncSettings) ? data.googleSyncSettings : null;
    } catch (error) {
        logger.error('Error loading Google sync settings:', error);
        return null;
    }
};

export const saveGoogleSyncSettings = async (uid: string, settings: GoogleSyncSettings): Promise<boolean> => {
    const firestore = db;
    if (!uid || !firestore) return false;

    try {
        const ref = doc(firestore, 'users', uid, 'data', 'settings');
        await setDoc(ref, {
            googleSyncSettings: settings,
            updatedAt: serverTimestamp()
        }, { merge: true });
        return true;
    } catch (error) {
        logger.error('Error saving Google sync settings:', error);
        return false;
    }
};
