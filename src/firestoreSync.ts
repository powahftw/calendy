import { db } from './firebase';
import {
    doc,
    setDoc,
    onSnapshot,
    getDoc,
    serverTimestamp,
    FieldValue
} from 'firebase/firestore';
import { PlannerSettings } from './utils/calendarUtils';
import { logger } from './utils/logger';
import { getTimestampInMillis } from './utils/persistence';
import { CalendarSelection, isCalendarSelection } from './utils/calendarSettings';

/**
 * Firestore stores configuration only. Calendar events are read live from the
 * Google Calendar API and cached in the browser, never written here.
 */

const SETTINGS_FIELDS = [
    'theme',
    'highlightToday',
    'showWeekends',
    'showDayProgress',
    'weekdayAlign',
    'pillUnmarkedEvents',
    'year',
    'startMonth',
    'monthsToShow'
] as const;

const getSettingsRef = (uid: string) => {
    const firestore = db;
    if (!uid || !firestore) return null;
    return doc(firestore, 'users', uid, 'data', 'settings');
};

const toPlannerSettings = (data: Record<string, unknown>): Partial<PlannerSettings> => {
    // The selected calendar lives in the same document but is read separately.
    const settings: Partial<PlannerSettings> = {};

    for (const key of SETTINGS_FIELDS) {
        if (key in data) {
            (settings as Record<string, unknown>)[key] = data[key];
        }
    }

    return settings;
};

export const syncSettings = async (uid: string, settings: PlannerSettings, timestamp?: number | FieldValue): Promise<boolean> => {
    const ref = getSettingsRef(uid);
    if (!ref) return false;

    try {
        logger.info('Syncing Settings to Firestore...', settings);
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
 * Subscribe to settings changes from Firestore.
 * Returns an unsubscribe function.
 */
export const subscribeToSettings = (uid: string, callback: (settings: Partial<PlannerSettings> & { updatedAt?: number }) => void) => {
    const ref = getSettingsRef(uid);
    if (!ref) return () => { };

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

export const loadSettings = async (uid: string): Promise<(Partial<PlannerSettings> & { updatedAt?: number | null }) | null> => {
    const ref = getSettingsRef(uid);
    if (!ref) return null;

    try {
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

export const subscribeToCalendarSelection = (uid: string, callback: (selection: CalendarSelection | null) => void) => {
    const ref = getSettingsRef(uid);
    if (!ref) return () => { };

    return onSnapshot(ref, (snapshot) => {
        if (!snapshot.exists()) {
            callback(null);
            return;
        }

        const data = snapshot.data();
        callback(isCalendarSelection(data.calendarSelection) ? data.calendarSelection : null);
    }, (error) => {
        logger.error('Error subscribing to calendar selection:', error);
    });
};

export const saveCalendarSelection = async (uid: string, selection: CalendarSelection): Promise<boolean> => {
    const ref = getSettingsRef(uid);
    if (!ref) return false;

    try {
        await setDoc(ref, {
            calendarSelection: selection,
            updatedAt: serverTimestamp()
        }, { merge: true });
        return true;
    } catch (error) {
        logger.error('Error saving calendar selection:', error);
        return false;
    }
};
