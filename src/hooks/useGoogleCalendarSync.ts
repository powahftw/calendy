import { Dispatch, SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import toast from 'react-hot-toast';
import { CalendarApiError, CalendarService, GoogleAuthPopupBlockedError } from '../services/CalendarService';
import {
    loadGoogleSyncSettings,
    saveGoogleSyncSettings
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

const SYNC_FOCUS_DEBOUNCE_MS = 2000;
const MAX_BACKGROUND_GOOGLE_WRITES = 25;

export interface GoogleCalendarSyncControls {
    settings: GoogleSyncSettings | null;
    loading: boolean;
    syncing: boolean;
    error: string | null;
    setup: () => Promise<boolean>;
    syncNow: () => Promise<void>;
}

const fireAndForget = (promise: Promise<unknown>, label: string) => (
    void promise.catch((err) => logger.error(`GCal ${label} failed`, err))
);

const sameSyncedFields = (a: PlannerEvent, b: PlannerEvent) => (
    a.title === b.title
    && a.start === b.start
    && a.end === b.end
    && a.gcalEventId === b.gcalEventId
);

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

export const useGoogleCalendarSync = (
    user: User | null,
    events: PlannerEvent[],
    rawSetEvents: SetEvents,
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

        let cancelled = false;
        void loadGoogleSyncSettings(userUid).then((loaded) => {
            if (!cancelled) setSettings(loaded);
        });

        return () => {
            cancelled = true;
        };
    }, [isHydrated, userUid]);

    const saveSettings = useCallback(async (next: GoogleSyncSettings) => {
        if (!userUid) return false;
        const saved = await saveGoogleSyncSettings(userUid, next);
        if (saved) setSettings(next);
        return saved;
    }, [userUid]);

    const updateSettings = useCallback(async (updates: Partial<GoogleSyncSettings>) => {
        const current = settingsRef.current;
        if (!userUid || !current) return null;

        const next = { ...current, ...updates };
        const saved = await saveGoogleSyncSettings(userUid, next);
        if (saved) setSettings(next);
        return saved ? next : null;
    }, [userUid]);

    const commitEventsIfChanged = useCallback((nextEvents: PlannerEvent[]) => {
        // The Google mirror returns the same reference when no local gcal ids changed,
        // so this is a meaningful early exit, not just a performance hint.
        if (nextEvents === eventsRef.current) return;

        rawSetEvents(nextEvents);
        eventsRef.current = nextEvents;
    }, [rawSetEvents]);

    const updateLocalGoogleEventId = useCallback((eventId: string, gcalEventId: string | undefined) => {
        rawSetEvents((current) => {
            const nextEvents = current.map((item) => (
                item.id === eventId && item.gcalEventId !== gcalEventId
                    ? { ...item, gcalEventId }
                    : item
            ));
            eventsRef.current = nextEvents;
            return nextEvents;
        });
    }, [rawSetEvents]);

    const deleteGoogleEventIfPresent = useCallback(async (calendarId: string, eventId: string) => {
        try {
            await calendarService.deleteEvent(calendarId, eventId);
        } catch (err) {
            if (!isMissingGoogleEventError(err)) throw err;
        }
    }, [calendarService]);

    const upsertLocalEventToGoogle = useCallback(async (calendarId: string, event: PlannerEvent) => {
        if (event.gcalEventId) {
            try {
                await calendarService.patchEvent(calendarId, event.gcalEventId, toGooglePayload(event));
                return event.gcalEventId;
            } catch (err) {
                if (!isMissingGoogleEventError(err)) throw err;
            }
        }

        const googleEvent = await calendarService.insertEvent(calendarId, toGooglePayload(event));
        return googleEvent.id;
    }, [calendarService]);

    const syncLocalEventToGoogle = useCallback(async (calendarId: string, event: PlannerEvent) => {
        const gcalEventId = await upsertLocalEventToGoogle(calendarId, event);
        if (gcalEventId && gcalEventId !== event.gcalEventId) {
            updateLocalGoogleEventId(event.id, gcalEventId);
        }
    }, [updateLocalGoogleEventId, upsertLocalEventToGoogle]);

    const syncLocalChangeToGoogle = useCallback(async (previousEvents: PlannerEvent[], nextEvents: PlannerEvent[]) => {
        const currentSettings = settingsRef.current;
        if (!currentSettings?.enabled || !userUid) return;
        if (!calendarService.hasFreshToken()) return;

        const { calendarId } = currentSettings;
        const previousById = new Map(previousEvents.map((event) => [event.id, event]));
        const nextIds = new Set(nextEvents.map((event) => event.id));

        for (const previous of previousEvents) {
            if (!nextIds.has(previous.id) && previous.gcalEventId) {
                fireAndForget(deleteGoogleEventIfPresent(calendarId, previous.gcalEventId), 'delete');
            }
        }

        for (const next of nextEvents) {
            const previous = previousById.get(next.id);

            if (!previous) {
                if (isGoogleSyncEligible(next)) {
                    fireAndForget(syncLocalEventToGoogle(calendarId, next), 'upsert');
                }
                continue;
            }

            if (sameSyncedFields(previous, next)) continue;

            if (next.gcalEventId && !isGoogleSyncEligible(next)) {
                fireAndForget(
                    deleteGoogleEventIfPresent(calendarId, next.gcalEventId)
                        .then(() => updateLocalGoogleEventId(next.id, undefined)),
                    'delete for ineligible event'
                );
                continue;
            }

            if (isGoogleSyncEligible(next)) {
                fireAndForget(syncLocalEventToGoogle(calendarId, next), 'upsert');
            }
        }
    }, [calendarService, deleteGoogleEventIfPresent, syncLocalEventToGoogle, updateLocalGoogleEventId, userUid]);

    const setEventsWithGoogleSync = useCallback<SetEvents>((eventsOrUpdater) => {
        const previousEvents = eventsRef.current;
        const nextEvents = typeof eventsOrUpdater === 'function'
            ? eventsOrUpdater(previousEvents)
            : eventsOrUpdater;

        rawSetEvents(nextEvents);
        eventsRef.current = nextEvents;
        void syncLocalChangeToGoogle(previousEvents, nextEvents);
    }, [rawSetEvents, syncLocalChangeToGoogle]);

    const mirrorLocalEventsToGoogle = useCallback(async (calendarId: string, localEvents: PlannerEvent[]) => {
        const googleEvents = await calendarService.listEvents(calendarId);
        const expectedGoogleIds = new Set(
            localEvents
                .filter(isGoogleSyncEligible)
                .map((event) => event.gcalEventId)
                .filter((eventId): eventId is string => Boolean(eventId))
        );

        let writes = 0;
        const updates: Array<{ eventId: string; gcalEventId: string | undefined }> = [];

        for (const event of googleEvents) {
            if (writes >= MAX_BACKGROUND_GOOGLE_WRITES) break;
            if (event.id && !expectedGoogleIds.has(event.id)) {
                await deleteGoogleEventIfPresent(calendarId, event.id);
                writes += 1;
            }
        }

        for (const event of localEvents) {
            if (writes >= MAX_BACKGROUND_GOOGLE_WRITES) break;
            if (!isGoogleSyncEligible(event)) {
                if (event.gcalEventId) {
                    await deleteGoogleEventIfPresent(calendarId, event.gcalEventId);
                    updates.push({ eventId: event.id, gcalEventId: undefined });
                    writes += 1;
                }

                continue;
            }

            if (!event.gcalEventId) {
                const gcalEventId = await upsertLocalEventToGoogle(calendarId, event);
                if (gcalEventId) updates.push({ eventId: event.id, gcalEventId });
                writes += 1;
            }
        }

        const gcalIdsByEventId = new Map(
            updates.map((update) => [update.eventId, update.gcalEventId])
        );

        if (gcalIdsByEventId.size === 0) return localEvents;

        return localEvents.map((event) => (
            gcalIdsByEventId.has(event.id)
                ? { ...event, gcalEventId: gcalIdsByEventId.get(event.id) }
                : event
        ));
    }, [calendarService, deleteGoogleEventIfPresent, upsertLocalEventToGoogle]);

    const syncWithGoogle = useCallback(async (interactive = false) => {
        const currentSettings = settingsRef.current;
        if (!userUid || !isHydrated || !currentSettings?.enabled || syncInFlightRef.current) return;
        if (!interactive && !calendarService.hasFreshToken()) return;

        syncInFlightRef.current = true;
        setSyncing(true);
        setError(null);

        try {
            await calendarService.authenticate({ prompt: '' });

            const nextEvents = await mirrorLocalEventsToGoogle(currentSettings.calendarId, eventsRef.current);
            commitEventsIfChanged(nextEvents);
            await updateSettings({ lastSyncedAt: Date.now() });
        } catch (err) {
            if (!interactive && err instanceof GoogleAuthPopupBlockedError) return;

            logger.error('Google Calendar sync failed', err);
            const message = isRateLimitError(err)
                ? 'Google Calendar rate limit hit. Calendy saved the change locally and will retry later.'
                : getUserFacingErrorMessage(err, 'Google Calendar sync failed.');
            setError(message);
        } finally {
            syncInFlightRef.current = false;
            setSyncing(false);
        }
    }, [calendarService, commitEventsIfChanged, isHydrated, mirrorLocalEventsToGoogle, updateSettings, userUid]);

    useEffect(() => {
        if (!settings?.enabled || !isHydrated) return;

        void syncWithGoogle();
        // Run once when persisted sync settings become ready; focus changes are handled separately.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isHydrated, settings?.enabled]);

    useEffect(() => {
        if (!settings?.enabled || !isHydrated) return;

        const handleFocus = () => {
            const now = Date.now();
            if (now - lastFocusSyncAtRef.current < SYNC_FOCUS_DEBOUNCE_MS) return;

            lastFocusSyncAtRef.current = now;
            void syncWithGoogle();
        };

        window.addEventListener('focus', handleFocus);
        return () => window.removeEventListener('focus', handleFocus);
    }, [isHydrated, settings?.enabled, syncWithGoogle]);

    const setupGoogleSync = useCallback(async () => {
        if (!userUid) {
            toast.error('Sign in to sync with Google Calendar.');
            return false;
        }

        setLoading(true);
        setError(null);

        try {
            await calendarService.authenticate({ prompt: 'select_account' });
            const calendar = await calendarService.createCalendar('Calendy');

            if (!calendar.id) {
                throw new Error('Google did not return a calendar id.');
            }

            const nextEvents = await mirrorLocalEventsToGoogle(calendar.id, eventsRef.current);
            commitEventsIfChanged(nextEvents);

            const nextSettings: GoogleSyncSettings = {
                enabled: true,
                calendarId: calendar.id,
                syncToken: '',
                lastSyncedAt: Date.now()
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
    }, [calendarService, commitEventsIfChanged, mirrorLocalEventsToGoogle, saveSettings, userUid]);

    const googleSync = useMemo<GoogleCalendarSyncControls>(() => ({
        settings,
        loading,
        syncing,
        error,
        setup: setupGoogleSync,
        syncNow: () => syncWithGoogle(true)
    }), [error, loading, settings, setupGoogleSync, syncing, syncWithGoogle]);

    return {
        googleSync,
        setEventsWithGoogleSync
    };
};
