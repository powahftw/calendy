import { Dispatch, SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import toast from 'react-hot-toast';
import { CalendarApiError, CalendarService, GoogleEvent } from '../services/CalendarService';
import {
    loadGoogleSyncSettings,
    saveGoogleSyncSettings
} from '../firestoreSync';
import { PlannerEvent } from '../utils/calendarUtils';
import {
    GoogleSyncSettings,
    fromGoogleAllDayRange,
    googleEventToPlannerEvent,
    hasRealTitle,
    isGoogleSyncEligible,
    toGoogleAllDayRange
} from '../utils/googleCalendarSync';
import { logger } from '../utils/logger';
import { getUserFacingErrorMessage } from '../utils/userFacingErrors';

type SetEvents = Dispatch<SetStateAction<PlannerEvent[]>>;

const SYNC_FOCUS_DEBOUNCE_MS = 2000;

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
        // applyGoogleChanges returns the same reference when nothing changed,
        // so this is a meaningful early exit, not just a performance hint.
        if (nextEvents === eventsRef.current) return;

        rawSetEvents(nextEvents);
        eventsRef.current = nextEvents;
    }, [rawSetEvents]);

    const insertLocalEventToGoogle = useCallback(async (calendarId: string, event: PlannerEvent) => {
        const googleEvent = await calendarService.insertEvent(calendarId, toGooglePayload(event));
        if (!googleEvent.id) return;

        rawSetEvents((current) => current.map((item) => (
            item.id === event.id && item.gcalEventId !== googleEvent.id
                ? { ...item, gcalEventId: googleEvent.id }
                : item
        )));
    }, [calendarService, rawSetEvents]);

    const syncLocalChangeToGoogle = useCallback(async (previousEvents: PlannerEvent[], nextEvents: PlannerEvent[]) => {
        const currentSettings = settingsRef.current;
        if (!currentSettings?.enabled || !userUid) return;

        const { calendarId } = currentSettings;
        const previousById = new Map(previousEvents.map((event) => [event.id, event]));
        const nextIds = new Set(nextEvents.map((event) => event.id));

        for (const previous of previousEvents) {
            if (!nextIds.has(previous.id) && previous.gcalEventId) {
                fireAndForget(calendarService.deleteEvent(calendarId, previous.gcalEventId), 'delete');
            }
        }

        for (const next of nextEvents) {
            const previous = previousById.get(next.id);

            if (!previous) {
                if (isGoogleSyncEligible(next)) {
                    fireAndForget(insertLocalEventToGoogle(calendarId, next), 'insert');
                }
                continue;
            }

            if (sameSyncedFields(previous, next)) continue;

            if (next.gcalEventId && !isGoogleSyncEligible(next)) {
                fireAndForget(
                    calendarService.deleteEvent(calendarId, next.gcalEventId)
                        .then(() => {
                            rawSetEvents((current) => current.map((item) => (
                                item.id === next.id ? { ...item, gcalEventId: undefined } : item
                            )));
                        }),
                    'delete for ineligible event'
                );
                continue;
            }

            if (next.gcalEventId && isGoogleSyncEligible(next)) {
                fireAndForget(calendarService.patchEvent(calendarId, next.gcalEventId, toGooglePayload(next)), 'patch');
                continue;
            }

            if (!next.gcalEventId && isGoogleSyncEligible(next)) {
                fireAndForget(insertLocalEventToGoogle(calendarId, next), 'insert');
            }
        }
    }, [calendarService, insertLocalEventToGoogle, rawSetEvents, userUid]);

    const setEventsWithGoogleSync = useCallback<SetEvents>((eventsOrUpdater) => {
        const previousEvents = eventsRef.current;
        const nextEvents = typeof eventsOrUpdater === 'function'
            ? eventsOrUpdater(previousEvents)
            : eventsOrUpdater;

        rawSetEvents(nextEvents);
        eventsRef.current = nextEvents;
        void syncLocalChangeToGoogle(previousEvents, nextEvents);
    }, [rawSetEvents, syncLocalChangeToGoogle]);

    const applyGoogleChanges = useCallback((changedEvents: GoogleEvent[], knownEvents: PlannerEvent[]) => {
        let nextEvents = knownEvents;

        for (const googleEvent of changedEvents) {
            if (!googleEvent.id) continue;

            const existing = nextEvents.find((event) => event.gcalEventId === googleEvent.id);

            if (googleEvent.status === 'cancelled') {
                if (existing) {
                    nextEvents = nextEvents.filter((event) => event.id !== existing.id);
                }
                continue;
            }

            const title = googleEvent.summary?.trim() ?? '';
            const range = fromGoogleAllDayRange(googleEvent);

            if (!range || !hasRealTitle(title)) {
                // Calendy keeps note/marker events locally, while Google only mirrors titled all-day events.
                // Ignore invalid or timed Google updates instead of deleting local Calendy state.
                continue;
            }

            if (existing) {
                nextEvents = nextEvents.map((event) => (
                    event.id === existing.id
                        ? { ...event, title, start: range.start, end: range.end }
                        : event
                ));
                continue;
            }

            const newEvent = googleEventToPlannerEvent(googleEvent);
            if (newEvent) nextEvents = [...nextEvents, newEvent];
        }

        return nextEvents;
    }, []);

    const pushUnsyncedLocalEvents = useCallback(async (calendarId: string, localEvents: PlannerEvent[]) => {
        const results = await Promise.all(
            localEvents
                .filter((event) => isGoogleSyncEligible(event) && !event.gcalEventId)
                .map(async (event) => {
                    const googleEvent = await calendarService.insertEvent(calendarId, toGooglePayload(event));
                    return { eventId: event.id, gcalEventId: googleEvent.id };
                })
        );

        const gcalIdsByEventId = new Map(
            results
                .filter((result) => result.gcalEventId)
                .map((result) => [result.eventId, result.gcalEventId])
        );

        if (gcalIdsByEventId.size === 0) return localEvents;

        return localEvents.map((event) => {
            const gcalEventId = gcalIdsByEventId.get(event.id);
            return gcalEventId ? { ...event, gcalEventId } : event;
        });
    }, [calendarService]);

    const replaceWithFullGoogleState = useCallback(async (calendarId: string) => {
        let pageToken: string | undefined;
        let nextSyncToken = '';
        const googleEvents: GoogleEvent[] = [];

        do {
            const page = await calendarService.listEventsPage(calendarId, { pageToken });
            googleEvents.push(...page.items);
            pageToken = page.nextPageToken;
            if (!pageToken && page.nextSyncToken) nextSyncToken = page.nextSyncToken;
        } while (pageToken);

        const googleIds = new Set(googleEvents.map((event) => event.id).filter(Boolean));
        const filteredLocalEvents = eventsRef.current.filter((event) => (
            !event.gcalEventId || googleIds.has(event.gcalEventId)
        ));
        const survivingLocalEvents = filteredLocalEvents.length === eventsRef.current.length
            ? eventsRef.current
            : filteredLocalEvents;
        let nextEvents = applyGoogleChanges(googleEvents, survivingLocalEvents);
        nextEvents = await pushUnsyncedLocalEvents(calendarId, nextEvents);
        commitEventsIfChanged(nextEvents);

        if (nextSyncToken) {
            await updateSettings({ syncToken: nextSyncToken, lastSyncedAt: Date.now() });
        }
    }, [applyGoogleChanges, calendarService, commitEventsIfChanged, pushUnsyncedLocalEvents, updateSettings]);

    const syncWithGoogle = useCallback(async () => {
        const currentSettings = settingsRef.current;
        if (!userUid || !isHydrated || !currentSettings?.enabled || syncInFlightRef.current) return;

        syncInFlightRef.current = true;
        setSyncing(true);
        setError(null);

        try {
            await calendarService.authenticate({ prompt: '' });

            let pageToken: string | undefined;
            const changedEvents: GoogleEvent[] = [];
            let nextSyncToken = currentSettings.syncToken;
            let savedSyncCheckpoint = false;

            try {
                do {
                    const page = await calendarService.listEventsPage(currentSettings.calendarId, {
                        syncToken: currentSettings.syncToken,
                        pageToken
                    });

                    changedEvents.push(...page.items);
                    pageToken = page.nextPageToken;
                    if (!pageToken && page.nextSyncToken) {
                        nextSyncToken = page.nextSyncToken;
                        await updateSettings({ syncToken: nextSyncToken, lastSyncedAt: Date.now() });
                        savedSyncCheckpoint = true;
                    }
                } while (pageToken);
            } catch (err) {
                if (err instanceof CalendarApiError && err.status === 410) {
                    await replaceWithFullGoogleState(currentSettings.calendarId);
                    return;
                }
                throw err;
            }

            let nextEvents = applyGoogleChanges(changedEvents, eventsRef.current);
            nextEvents = await pushUnsyncedLocalEvents(currentSettings.calendarId, nextEvents);
            commitEventsIfChanged(nextEvents);

            if (!savedSyncCheckpoint) {
                await updateSettings({ syncToken: nextSyncToken, lastSyncedAt: Date.now() });
            }
        } catch (err) {
            logger.error('Google Calendar sync failed', err);
            const message = getUserFacingErrorMessage(err, 'Google Calendar sync failed.');
            setError(message);
        } finally {
            syncInFlightRef.current = false;
            setSyncing(false);
        }
    }, [
        applyGoogleChanges,
        calendarService,
        commitEventsIfChanged,
        isHydrated,
        pushUnsyncedLocalEvents,
        replaceWithFullGoogleState,
        updateSettings,
        userUid
    ]);

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

            const firstPage = await calendarService.listEventsPage(calendar.id);
            const syncToken = firstPage.nextSyncToken || '';

            const nextEvents = await pushUnsyncedLocalEvents(calendar.id, eventsRef.current);
            commitEventsIfChanged(nextEvents);

            const nextSettings: GoogleSyncSettings = {
                enabled: true,
                calendarId: calendar.id,
                syncToken,
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
    }, [calendarService, commitEventsIfChanged, pushUnsyncedLocalEvents, saveSettings, userUid]);

    const googleSync = useMemo<GoogleCalendarSyncControls>(() => ({
        settings,
        loading,
        syncing,
        error,
        setup: setupGoogleSync,
        syncNow: syncWithGoogle
    }), [error, loading, settings, setupGoogleSync, syncing, syncWithGoogle]);

    return {
        googleSync,
        setEventsWithGoogleSync
    };
};
