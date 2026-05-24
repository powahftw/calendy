import { Dispatch, SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import toast from 'react-hot-toast';
import {
    CalendarApiError,
    CalendarAuthorizationRequiredError,
    CalendarService,
    GoogleEvent,
    preloadGoogleIdentityApi
} from '../services/CalendarService';
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
const GOOGLE_CALENDAR_SYNC_CONCURRENCY = 4;

export interface GoogleCalendarSyncControls {
    settings: GoogleSyncSettings | null;
    loading: boolean;
    syncing: boolean;
    error: string | null;
    authorizationRequired: boolean;
    setup: () => Promise<boolean>;
    resume: () => Promise<boolean>;
    disconnect: () => Promise<boolean>;
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

const isAuthorizationError = (err: unknown) => (
    err instanceof CalendarAuthorizationRequiredError
    || (err instanceof CalendarApiError && (err.status === 401 || (err.status === 403 && !isRateLimitError(err))))
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

const mapWithConcurrency = async <T, R>(
    items: T[],
    limit: number,
    mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> => {
    const results = new Array<R>(items.length);
    let nextIndex = 0;

    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (nextIndex < items.length) {
            const currentIndex = nextIndex;
            nextIndex += 1;
            results[currentIndex] = await mapper(items[currentIndex], currentIndex);
        }
    });

    await Promise.all(workers);
    return results;
};

interface EventSyncResult {
    expectedGoogleIds: string[];
    deletedGoogleIds: string[];
    updates: Array<{ eventId: string; gcalEventId?: string }>;
}

const EMPTY_EVENT_SYNC_RESULT: EventSyncResult = {
    expectedGoogleIds: [],
    deletedGoogleIds: [],
    updates: []
};

export const useGoogleCalendarSync = (
    user: User | null,
    events: PlannerEvent[],
    rawSetEvents: SetEvents,
    stampGoogleEventIds: StampGoogleEventIds,
    isHydrated: boolean,
    googleCalendarAccessToken: string | null
) => {
    const calendarService = useMemo(() => new CalendarService(), []);
    const userUid = user?.uid ?? null;
    const userEmail = user?.email ?? null;
    const [settings, setSettings] = useState<GoogleSyncSettings | null>(null);
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [authorizationRequired, setAuthorizationRequired] = useState(false);
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
        preloadGoogleIdentityApi();
    }, []);

    useEffect(() => {
        if (!googleCalendarAccessToken) return;
        calendarService.setAccessToken(googleCalendarAccessToken);
        setAuthorizationRequired(false);
    }, [calendarService, googleCalendarAccessToken]);

    useEffect(() => {
        if (!userUid || !userEmail || !isHydrated) {
            setSettings(null);
            setAuthorizationRequired(false);
            return;
        }

        return subscribeToGoogleSyncSettings(userUid, setSettings);
    }, [isHydrated, userEmail, userUid]);

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

        const syncResults = await mapWithConcurrency(localEvents, GOOGLE_CALENDAR_SYNC_CONCURRENCY, async (event): Promise<EventSyncResult> => {
            if (!isGoogleSyncEligible(event)) {
                if (event.gcalEventId) {
                    await deleteGoogleEventIfPresent(calendarId, event.gcalEventId);
                    return {
                        expectedGoogleIds: [],
                        deletedGoogleIds: [event.gcalEventId],
                        updates: [{ eventId: event.id, gcalEventId: undefined }]
                    };
                }
                return EMPTY_EVENT_SYNC_RESULT;
            }

            if (!event.gcalEventId) {
                const gcalEventId = await insertLocalEventToGoogle(calendarId, event);
                if (gcalEventId) {
                    return {
                        expectedGoogleIds: [gcalEventId],
                        deletedGoogleIds: [],
                        updates: [{ eventId: event.id, gcalEventId }]
                    };
                }
                return EMPTY_EVENT_SYNC_RESULT;
            }

            const googleEvent = googleEventsById.get(event.gcalEventId);
            if (googleEvent && googleEventMatches(googleEvent, event)) {
                return {
                    expectedGoogleIds: [event.gcalEventId],
                    deletedGoogleIds: [],
                    updates: []
                };
            }

            try {
                const patched = await calendarService.patchEvent(calendarId, event.gcalEventId, toGooglePayload(event));
                const gcalEventId = patched.id || event.gcalEventId;
                return {
                    expectedGoogleIds: [gcalEventId],
                    deletedGoogleIds: [],
                    updates: gcalEventId !== event.gcalEventId ? [{ eventId: event.id, gcalEventId }] : []
                };
            } catch (err) {
                if (!isMissingGoogleEventError(err)) throw err;

                const gcalEventId = await insertLocalEventToGoogle(calendarId, event);
                if (gcalEventId) {
                    return {
                        expectedGoogleIds: [gcalEventId],
                        deletedGoogleIds: [],
                        updates: [{ eventId: event.id, gcalEventId }]
                    };
                }
                return EMPTY_EVENT_SYNC_RESULT;
            }
        });

        for (const result of syncResults) {
            result.expectedGoogleIds.forEach((id) => expectedGoogleIds.add(id));
            result.deletedGoogleIds.forEach((id) => deletedGoogleIds.add(id));
            updates.push(...result.updates);
        }

        const orphanGoogleEventIds = googleEvents
            .map((event) => event.id)
            .filter((id): id is string => Boolean(id) && !expectedGoogleIds.has(id) && !deletedGoogleIds.has(id));

        await mapWithConcurrency(orphanGoogleEventIds, GOOGLE_CALENDAR_SYNC_CONCURRENCY, async (eventId) => {
            await deleteGoogleEventIfPresent(calendarId, eventId);
        });

        return updates;
    }, [calendarService, deleteGoogleEventIfPresent, insertLocalEventToGoogle]);

    const ensureCalendarAccess = useCallback(async (interactive: boolean) => {
        if (calendarService.hasValidToken()) {
            setAuthorizationRequired(false);
            return true;
        }

        if (!interactive || !userEmail) {
            setAuthorizationRequired(true);
            return false;
        }

        await calendarService.requestInteractiveToken(userEmail);
        setAuthorizationRequired(false);
        return true;
    }, [calendarService, userEmail]);

    const findOrCreateCalendar = useCallback(async (preferredCalendarId?: string) => {
        if (preferredCalendarId) {
            try {
                const calendar = await calendarService.getCalendar(preferredCalendarId);
                if (calendar.id) return calendar;
            } catch (err) {
                if (!isMissingGoogleEventError(err) && !(err instanceof CalendarApiError && err.status === 403)) {
                    throw err;
                }
            }
        }

        const calendars = await calendarService.listCalendars();
        const existingCalendar = calendars.find((calendar) => calendar.summary === 'Calendy');
        return existingCalendar ?? await calendarService.createCalendar('Calendy');
    }, [calendarService]);

    const syncToGoogle = useCallback(async (interactive = false) => {
        const currentSettings = settingsRef.current;
        if (!userUid || !userEmail || !isHydrated || !currentSettings?.enabled) return;

        if (syncTimeoutRef.current) {
            clearTimeout(syncTimeoutRef.current);
            syncTimeoutRef.current = null;
        }

        const hasAccess = await ensureCalendarAccess(interactive);
        if (!hasAccess) {
            if (interactive) {
                const message = 'Reconnect Google Calendar sync to continue.';
                setError(message);
                toast.error(message);
            } else {
                setError(null);
            }
            return;
        }

        if (syncInFlightRef.current) {
            syncQueuedRef.current = true;
            return;
        }

        syncInFlightRef.current = true;
        setSyncing(true);
        setError(null);

        try {
            const updates = await pushLocalEventsToGoogle(currentSettings.calendarId, eventsRef.current);
            // Keep queued syncs from seeing stale missing gcal ids before React commits the metadata update.
            eventsRef.current = applyGoogleEventIdUpdates(eventsRef.current, updates);
            stampGoogleEventIds(updates);
            setAuthorizationRequired(false);
        } catch (err) {
            logger.error('Google Calendar sync failed', err);
            if (isAuthorizationError(err)) {
                calendarService.clearAccessToken();
                setAuthorizationRequired(true);
            }
            const message = isAuthorizationError(err)
                ? 'Reconnect Google Calendar sync to continue.'
                : isRateLimitError(err)
                ? 'Google Calendar rate limit hit. Calendy saved the change locally and will retry later.'
                : getUserFacingErrorMessage(err, 'Google Calendar sync failed.');
            setError(interactive ? message : null);
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
        ensureCalendarAccess,
        isHydrated,
        pushLocalEventsToGoogle,
        stampGoogleEventIds,
        userEmail,
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

    const connectGoogleSync = useCallback(async () => {
        if (!userUid || !userEmail) {
            toast.error('Sign in to sync with Google Calendar.');
            return false;
        }

        setLoading(true);
        setError(null);

        try {
            await calendarService.requestInteractiveToken(userEmail);
            const calendar = await findOrCreateCalendar(settingsRef.current?.calendarId);

            if (!calendar.id) {
                throw new Error('Google did not return a calendar id.');
            }

            const updates = await pushLocalEventsToGoogle(calendar.id, eventsRef.current);
            // Keep queued syncs from seeing stale missing gcal ids before React commits the metadata update.
            eventsRef.current = applyGoogleEventIdUpdates(eventsRef.current, updates);
            stampGoogleEventIds(updates);

            const nextSettings: GoogleSyncSettings = {
                enabled: true,
                calendarId: calendar.id,
                accountEmail: userEmail,
                calendarSummary: calendar.summary || 'Calendy'
            };

            const saved = await saveSettings(nextSettings);
            if (!saved) {
                throw new Error('Google sync settings could not be saved.');
            }

            toast.success('Google Calendar sync is connected.');
            return true;
        } catch (err) {
            logger.error('Google Calendar sync setup failed', err);
            if (isAuthorizationError(err)) {
                calendarService.clearAccessToken();
                setAuthorizationRequired(true);
            }
            const message = getUserFacingErrorMessage(err, 'Failed to connect Google Calendar sync.');
            setError(message);
            toast.error(message);
            return false;
        } finally {
            setLoading(false);
        }
    }, [
        calendarService,
        findOrCreateCalendar,
        pushLocalEventsToGoogle,
        saveSettings,
        stampGoogleEventIds,
        userEmail,
        userUid
    ]);

    const disconnectGoogleSync = useCallback(async () => {
        const currentSettings = settingsRef.current;
        if (!userUid || !currentSettings?.calendarId) return false;

        if (syncTimeoutRef.current) {
            clearTimeout(syncTimeoutRef.current);
            syncTimeoutRef.current = null;
        }
        syncQueuedRef.current = false;

        const nextSettings: GoogleSyncSettings = {
            ...currentSettings,
            enabled: false,
            accountEmail: currentSettings.accountEmail ?? userEmail ?? undefined
        };

        const saved = await saveSettings(nextSettings);
        if (saved) {
            setAuthorizationRequired(false);
            setError(null);
            toast.success('Google Calendar sync is disconnected.');
        } else {
            toast.error('Failed to disconnect Google Calendar sync.');
        }
        return saved;
    }, [saveSettings, userEmail, userUid]);

    const googleSync = useMemo<GoogleCalendarSyncControls>(() => ({
        settings,
        loading,
        syncing,
        error,
        authorizationRequired,
        setup: connectGoogleSync,
        resume: connectGoogleSync,
        disconnect: disconnectGoogleSync,
        syncNow: () => syncToGoogle(true)
    }), [
        authorizationRequired,
        connectGoogleSync,
        disconnectGoogleSync,
        error,
        loading,
        settings,
        syncing,
        syncToGoogle
    ]);

    return {
        googleSync,
        setEventsWithGoogleSync
    };
};
