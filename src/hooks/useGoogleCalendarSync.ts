import { Dispatch, SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import toast from 'react-hot-toast';
import { CalendarApiError, CalendarService, GoogleEvent } from '../services/CalendarService';
import {
    saveGoogleSyncSettings,
    subscribeToGoogleSyncSettings
} from '../firestoreSync';
import { PlannerEvent } from '../utils/calendarUtils';
import {
    GoogleSyncSettings,
    isGoogleSyncEligible,
    toGoogleAllDayRange
} from '../utils/googleCalendarSync';
import { logger } from '../utils/logger';
import { getUserFacingErrorMessage } from '../utils/userFacingErrors';

type SetEvents = Dispatch<SetStateAction<PlannerEvent[]>>;
type StampGoogleEventIds = (updates: Array<{ eventId: string; gcalEventId?: string }>) => void;

const LOCAL_SYNC_DEBOUNCE_MS = 30_000;
const SYNC_FOCUS_DEBOUNCE_MS = 2000;

export interface GoogleCalendarSyncControls {
    settings: GoogleSyncSettings | null;
    loading: boolean;
    syncing: boolean;
    error: string | null;
    setup: () => Promise<boolean>;
    syncNow: () => Promise<void>;
}

const toGooglePayload = (event: PlannerEvent) => {
    const range = toGoogleAllDayRange(event);
    return {
        summary: event.title,
        start: range.start,
        end: range.end
    };
};

const isMissingGoogleEventError = (err: unknown) => (
    err instanceof CalendarApiError && (err.status === 404 || err.status === 410)
);

const isRateLimitError = (err: unknown) => (
    err instanceof CalendarApiError && err.status === 403 && err.message.includes('rateLimitExceeded')
);

const googleEventMatches = (googleEvent: GoogleEvent, event: PlannerEvent) => {
    const payload = toGooglePayload(event);
    return googleEvent.status !== 'cancelled'
        && googleEvent.summary === payload.summary
        && googleEvent.start?.date === payload.start
        && googleEvent.end?.date === payload.end;
};

const applyGoogleEventIdUpdates = (
    events: PlannerEvent[],
    updates: Array<{ eventId: string; gcalEventId?: string }>
) => {
    if (updates.length === 0) return events;

    const gcalIdsByEventId = new Map(updates.map((update) => [update.eventId, update.gcalEventId]));
    return events.map((event) => {
        if (!gcalIdsByEventId.has(event.id)) return event;

        const gcalEventId = gcalIdsByEventId.get(event.id);
        if (event.gcalEventId === gcalEventId) return event;
        if (gcalEventId) return { ...event, gcalEventId };

        const nextEvent = { ...event };
        delete nextEvent.gcalEventId;
        return nextEvent;
    });
};

export const useGoogleCalendarSync = (
    user: User | null,
    events: PlannerEvent[],
    rawSetEvents: SetEvents,
    stampGoogleEventIds: StampGoogleEventIds,
    isHydrated: boolean
) => {
    const calendarService = useMemo(() => new CalendarService(), []);
    const userUid = user?.uid ?? null;
    const [settings, setSettings] = useState<GoogleSyncSettings | null>(null);
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const eventsRef = useRef(events);
    const settingsRef = useRef(settings);
    const syncInFlightRef = useRef(false);
    const syncQueuedRef = useRef(false);
    const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastFocusSyncAtRef = useRef(0);

    useEffect(() => {
        eventsRef.current = events;
    }, [events]);

    useEffect(() => {
        settingsRef.current = settings;
    }, [settings]);

    useEffect(() => {
        if (!userUid || !isHydrated) {
            setSettings(null);
            return;
        }

        return subscribeToGoogleSyncSettings(userUid, setSettings);
    }, [isHydrated, userUid]);

    useEffect(() => () => {
        if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    }, []);

    const saveSettings = useCallback(async (next: GoogleSyncSettings) => {
        if (!userUid) return false;
        const saved = await saveGoogleSyncSettings(userUid, next);
        if (saved) setSettings(next);
        return saved;
    }, [userUid]);

    const deleteGoogleEventIfPresent = useCallback(async (calendarId: string, eventId: string) => {
        try {
            await calendarService.deleteEvent(calendarId, eventId);
        } catch (err) {
            if (!isMissingGoogleEventError(err)) throw err;
        }
    }, [calendarService]);

    const insertLocalEventToGoogle = useCallback(async (calendarId: string, event: PlannerEvent) => {
        const googleEvent = await calendarService.insertEvent(calendarId, toGooglePayload(event));
        return googleEvent.id;
    }, [calendarService]);

    const pushLocalEventsToGoogle = useCallback(async (calendarId: string, localEvents: PlannerEvent[]) => {
        const googleEvents = await calendarService.listEvents(calendarId);
        const googleEventsById = new Map(
            googleEvents
                .filter((event) => event.id)
                .map((event) => [event.id, event])
        );
        const expectedGoogleIds = new Set<string>();
        const deletedGoogleIds = new Set<string>();
        const updates: Array<{ eventId: string; gcalEventId?: string }> = [];

        for (const event of localEvents) {
            if (!isGoogleSyncEligible(event)) {
                if (event.gcalEventId) {
                    await deleteGoogleEventIfPresent(calendarId, event.gcalEventId);
                    deletedGoogleIds.add(event.gcalEventId);
                    updates.push({ eventId: event.id, gcalEventId: undefined });
                }
                continue;
            }

            if (!event.gcalEventId) {
                const gcalEventId = await insertLocalEventToGoogle(calendarId, event);
                if (gcalEventId) {
                    expectedGoogleIds.add(gcalEventId);
                    updates.push({ eventId: event.id, gcalEventId });
                }
                continue;
            }

            const googleEvent = googleEventsById.get(event.gcalEventId);
            if (googleEvent && googleEventMatches(googleEvent, event)) {
                expectedGoogleIds.add(event.gcalEventId);
                continue;
            }

            try {
                const patched = await calendarService.patchEvent(calendarId, event.gcalEventId, toGooglePayload(event));
                const gcalEventId = patched.id || event.gcalEventId;
                expectedGoogleIds.add(gcalEventId);
                if (gcalEventId !== event.gcalEventId) {
                    updates.push({ eventId: event.id, gcalEventId });
                }
            } catch (err) {
                if (!isMissingGoogleEventError(err)) throw err;

                const gcalEventId = await insertLocalEventToGoogle(calendarId, event);
                if (gcalEventId) {
                    expectedGoogleIds.add(gcalEventId);
                    updates.push({ eventId: event.id, gcalEventId });
                }
            }
        }

        for (const googleEvent of googleEvents) {
            if (!googleEvent.id || expectedGoogleIds.has(googleEvent.id) || deletedGoogleIds.has(googleEvent.id)) {
                continue;
            }

            await deleteGoogleEventIfPresent(calendarId, googleEvent.id);
        }

        return updates;
    }, [calendarService, deleteGoogleEventIfPresent, insertLocalEventToGoogle]);

    const syncToGoogle = useCallback(async (interactive = false) => {
        const currentSettings = settingsRef.current;
        if (!userUid || !isHydrated || !currentSettings?.enabled) return;

        if (syncTimeoutRef.current) {
            clearTimeout(syncTimeoutRef.current);
            syncTimeoutRef.current = null;
        }

        if (syncInFlightRef.current) {
            syncQueuedRef.current = true;
            return;
        }

        syncInFlightRef.current = true;
        setSyncing(true);
        setError(null);

        try {
            await calendarService.authenticate({ prompt: '' });
            const updates = await pushLocalEventsToGoogle(currentSettings.calendarId, eventsRef.current);
            // Keep queued syncs from seeing stale missing gcal ids before React commits the metadata update.
            eventsRef.current = applyGoogleEventIdUpdates(eventsRef.current, updates);
            stampGoogleEventIds(updates);
        } catch (err) {
            logger.error('Google Calendar sync failed', err);
            const message = isRateLimitError(err)
                ? 'Google Calendar rate limit hit. Calendy saved the change locally and will retry later.'
                : getUserFacingErrorMessage(err, 'Google Calendar sync failed.');
            setError(message);
            if (interactive) toast.error(message);
        } finally {
            syncInFlightRef.current = false;
            setSyncing(false);

            if (syncQueuedRef.current) {
                syncQueuedRef.current = false;
                syncTimeoutRef.current = setTimeout(() => {
                    void syncToGoogle(false);
                }, 0);
            }
        }
    }, [
        calendarService,
        isHydrated,
        pushLocalEventsToGoogle,
        stampGoogleEventIds,
        userUid
    ]);

    const scheduleSyncToGoogle = useCallback(() => {
        if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);

        syncTimeoutRef.current = setTimeout(() => {
            void syncToGoogle(false);
        }, LOCAL_SYNC_DEBOUNCE_MS);
    }, [syncToGoogle]);

    const setEventsWithGoogleSync = useCallback<SetEvents>((eventsOrUpdater) => {
        const previousEvents = eventsRef.current;
        const nextEvents = typeof eventsOrUpdater === 'function'
            ? eventsOrUpdater(previousEvents)
            : eventsOrUpdater;

        rawSetEvents(nextEvents);

        if (settingsRef.current?.enabled) {
            scheduleSyncToGoogle();
        }
    }, [rawSetEvents, scheduleSyncToGoogle]);

    useEffect(() => {
        if (!settings?.enabled || !isHydrated) return;

        void syncToGoogle(false);
        // Run once when persisted sync settings become ready; focus changes are handled separately.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isHydrated, settings?.enabled]);

    useEffect(() => {
        if (!settings?.enabled || !isHydrated) return;

        const syncOnReturn = () => {
            const now = Date.now();
            if (now - lastFocusSyncAtRef.current < SYNC_FOCUS_DEBOUNCE_MS) return;

            lastFocusSyncAtRef.current = now;
            void syncToGoogle(false);
        };
        const handleFocus = () => syncOnReturn();
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') syncOnReturn();
        };

        window.addEventListener('focus', handleFocus);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            window.removeEventListener('focus', handleFocus);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [isHydrated, settings?.enabled, syncToGoogle]);

    const setupGoogleSync = useCallback(async () => {
        if (!userUid) {
            toast.error('Sign in to sync with Google Calendar.');
            return false;
        }

        setLoading(true);
        setError(null);

        try {
            await calendarService.authenticate({ prompt: 'select_account' });
            const calendars = await calendarService.listCalendars();
            const existingCalendar = calendars.find((calendar) => calendar.summary === 'Calendy');
            const calendar = existingCalendar ?? await calendarService.createCalendar('Calendy');

            if (!calendar.id) {
                throw new Error('Google did not return a calendar id.');
            }

            const updates = await pushLocalEventsToGoogle(calendar.id, eventsRef.current);
            // Keep queued syncs from seeing stale missing gcal ids before React commits the metadata update.
            eventsRef.current = applyGoogleEventIdUpdates(eventsRef.current, updates);
            stampGoogleEventIds(updates);

            const nextSettings: GoogleSyncSettings = {
                enabled: true,
                calendarId: calendar.id
            };

            const saved = await saveSettings(nextSettings);
            if (!saved) {
                throw new Error('Google sync settings could not be saved.');
            }

            toast.success('Google Calendar sync is connected.');
            return true;
        } catch (err) {
            logger.error('Google Calendar sync setup failed', err);
            const message = getUserFacingErrorMessage(err, 'Failed to connect Google Calendar sync.');
            setError(message);
            toast.error(message);
            return false;
        } finally {
            setLoading(false);
        }
    }, [
        calendarService,
        pushLocalEventsToGoogle,
        saveSettings,
        stampGoogleEventIds,
        userUid
    ]);

    const googleSync = useMemo<GoogleCalendarSyncControls>(() => ({
        settings,
        loading,
        syncing,
        error,
        setup: setupGoogleSync,
        syncNow: () => syncToGoogle(true)
    }), [error, loading, settings, setupGoogleSync, syncing, syncToGoogle]);

    return {
        googleSync,
        setEventsWithGoogleSync
    };
};
