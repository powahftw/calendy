import { db } from './firebase';
import {
    doc,
    setDoc,
    onSnapshot,
    serverTimestamp,
    deleteField,
    FieldValue
} from 'firebase/firestore';
import { EVENT_STYLE_COUNT, PlannerSettings } from './utils/calendarUtils';
import { logger } from './utils/logger';
import { getTimestampInMillis } from './utils/persistence';

/**
 * Which Google Calendar the user is looking at. Configuration, not event data:
 * it is the only calendar-related thing Calendy stores server side, so the
 * choice follows the user across devices.
 */
export interface CalendarSelection {
    calendarId: string;
    calendarSummary?: string;
    accountEmail?: string;
}

export type EventStyleOverrides = Record<string, number>;

export interface RemoteEventStyleOverrides {
    styles: EventStyleOverrides;
    updatedAt: number;
}

const isCalendarSelection = (value: unknown): value is CalendarSelection => {
    if (!value || typeof value !== 'object') return false;

    const selection = value as Record<string, unknown>;
    return typeof selection.calendarId === 'string'
        && selection.calendarId.length > 0
        && (!('calendarSummary' in selection) || typeof selection.calendarSummary === 'string')
        && (!('accountEmail' in selection) || typeof selection.accountEmail === 'string');
};

/**
 * Firestore stores configuration and user-selected styles only. Calendar event
 * contents are read live from Google and cached in the browser, never written here.
 */

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

const getSettingsRef = (uid: string) => {
    const firestore = db;
    if (!uid || !firestore) return null;
    return doc(firestore, 'users', uid, 'data', 'settings');
};

const hashString = (value: string, seed: number): string => {
    let hash = seed >>> 0;
    for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
};

/** Calendar IDs are not safe Firestore path segments, so use a stable 64-bit key. */
export const getEventStylesDocumentId = (calendarId: string) => (
    `${hashString(calendarId, 2166136261)}${hashString(calendarId, 3339675911)}`
);

const getEventStylesRef = (uid: string, calendarId: string) => {
    const firestore = db;
    if (!uid || !calendarId || !firestore) return null;
    return doc(firestore, 'users', uid, 'eventStyles', getEventStylesDocumentId(calendarId));
};

const isEventStyleOverrides = (value: unknown): value is EventStyleOverrides => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return Object.values(value).every((style) => (
        Number.isInteger(style) && Number(style) >= 0 && Number(style) < EVENT_STYLE_COUNT
    ));
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
            // Remove the field used by the interactive-planner version. The
            // current rules validate the whole merged document, so leaving it
            // behind would make this otherwise-valid migration write fail.
            googleSyncSettings: deleteField(),
            updatedAt: serverTimestamp()
        }, { merge: true });
        return true;
    } catch (error) {
        logger.error('Error saving calendar selection:', error);
        return false;
    }
};

export const syncEventStyleOverrides = async (
    uid: string,
    calendarId: string,
    styles: EventStyleOverrides,
    timestamp?: number | FieldValue
): Promise<boolean> => {
    const ref = getEventStylesRef(uid, calendarId);
    if (!ref) return false;

    try {
        await setDoc(ref, {
            calendarId,
            styles,
            updatedAt: timestamp || serverTimestamp()
        });
        return true;
    } catch (error) {
        logger.error('Error syncing event styles:', error);
        return false;
    }
};

export const subscribeToEventStyleOverrides = (
    uid: string,
    calendarId: string,
    callback: (styles: RemoteEventStyleOverrides) => void
) => {
    const ref = getEventStylesRef(uid, calendarId);
    if (!ref) return () => { };

    return onSnapshot(ref, (snapshot) => {
        if (!snapshot.exists()) return;

        const data = snapshot.data();
        if (data.calendarId !== calendarId || !isEventStyleOverrides(data.styles)) {
            logger.warn('Ignoring invalid event style overrides from Firestore');
            return;
        }

        callback({
            styles: data.styles,
            updatedAt: getTimestampInMillis(data.updatedAt)
        });
    }, (error) => {
        logger.error('Error subscribing to event styles:', error);
    });
};
