import { Dispatch, SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import toast from 'react-hot-toast';
import {
    CalendarApiError,
    CalendarAuthorizationRequiredError,
    CalendarService,
    GoogleEvent,
    isCalendarRateLimitError,
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
const RATE_LIMIT_INITIAL_COOLDOWN_MS = 60_000;
const RATE_LIMIT_MAX_COOLDOWN_MS = 5 * 60_000;
const RATE_LIMIT_JITTER_MS = 20_000;

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
    isCalendarRateLimitError(err)
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

const withoutGoogleEventIds = (events: PlannerEvent[]) => (
    events.map((event) => {
        if (!event.gcalEventId) return event;

        const nextEvent = { ...event };
        delete nextEvent.gcalEventId;
        return nextEvent;
    })
);

const clearGoogleEventIdUpdates = (events: PlannerEvent[]) => (
    events
        .filter((event) => event.gcalEventId)
        .map((event) => ({ eventId: event.id, gcalEventId: undefined }))
);

const formatCooldownMessage = (cooldownMs: number) => {
    const seconds = Math.max(1, Math.ceil(cooldownMs / 1000));
    return `Google is rate limiting sync. Calendy will retry in about ${seconds} seconds.`;
};

const logGoogleSync = (message: string, details?: Record<string, unknown>) => {
    console.info('[Google Calendar sync]', message, details ?? '');
};

const warnGoogleSync = (message: string, details?: Record<string, unknown>) => {
    console.warn('[Google Calendar sync]', message, details ?? '');
};

const getLocalSyncFingerprint = (calendarId: string, events: PlannerEvent[]) => (
    JSON.stringify({
        calendarId,
        events: events.map((event) => ({
            id: event.id,
            title: event.title,
            start: event.start,
            end: event.end,
            gcalEventId: event.gcalEventId ?? null
        }))
    })
);

export const useGoogleCalendarSync = (
    user: User | null,
    events: PlannerEvent[],
    rawSetEvents: SetEvents,
    stampGoogleEventIds: StampGoogleEventIds,
    isHydrated: boolean
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
    const rateLimitRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const rateLimitCooldownUntilRef = useRef(0);
    const rateLimitBackoffMsRef = useRef(RATE_LIMIT_INITIAL_COOLDOWN_MS);
    const lastFocusSyncAtRef = useRef(0);
    const lastSuccessfulSyncFingerprintRef = useRef<string | null>(null);
    const didInitialEnabledSyncRef = useRef(false);

    useEffect(() => {
        eventsRef.current = events;
    }, [events]);

    useEffect(() => {
        settingsRef.current = settings;
    }, [settings]);

    useEffect(() => {
        if (!settings?.enabled) {
            didInitialEnabledSyncRef.current = false;
            lastSuccessfulSyncFingerprintRef.current = null;
        }
    }, [settings?.enabled]);

    useEffect(() => {
        preloadGoogleIdentityApi();
    }, []);

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
        if (rateLimitRetryTimeoutRef.current) clearTimeout(rateLimitRetryTimeoutRef.current);
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
        const stats = {
            localEvents: localEvents.length,
            googleEvents: googleEvents.length,
            skipped: 0,
            inserted: 0,
            patched: 0,
            deleted: 0
        };

        for (const event of localEvents) {
            if (!isGoogleSyncEligible(event)) {
                if (event.gcalEventId) {
                    await deleteGoogleEventIfPresent(calendarId, event.gcalEventId);
                    deletedGoogleIds.add(event.gcalEventId);
                    updates.push({ eventId: event.id, gcalEventId: undefined });
                    stats.deleted += 1;
                }
                continue;
            }

            if (!event.gcalEventId) {
                const gcalEventId = await insertLocalEventToGoogle(calendarId, event);
                if (gcalEventId) {
                    expectedGoogleIds.add(gcalEventId);
                    updates.push({ eventId: event.id, gcalEventId });
                    stats.inserted += 1;
                }
                continue;
            }

            const googleEvent = googleEventsById.get(event.gcalEventId);
            if (!googleEvent) {
                const gcalEventId = await insertLocalEventToGoogle(calendarId, event);
                if (gcalEventId) {
                    expectedGoogleIds.add(gcalEventId);
                    updates.push({ eventId: event.id, gcalEventId });
                    stats.inserted += 1;
                }
                continue;
            }

            if (googleEvent && googleEventMatches(googleEvent, event)) {
                expectedGoogleIds.add(event.gcalEventId);
                stats.skipped += 1;
                continue;
            }

            try {
                const patched = await calendarService.patchEvent(calendarId, event.gcalEventId, toGooglePayload(event));
                const gcalEventId = patched.id || event.gcalEventId;
                expectedGoogleIds.add(gcalEventId);
                stats.patched += 1;
                if (gcalEventId !== event.gcalEventId) {
                    updates.push({ eventId: event.id, gcalEventId });
                }
            } catch (err) {
                if (!isMissingGoogleEventError(err)) throw err;

                const gcalEventId = await insertLocalEventToGoogle(calendarId, event);
                if (gcalEventId) {
                    expectedGoogleIds.add(gcalEventId);
                    updates.push({ eventId: event.id, gcalEventId });
                    stats.inserted += 1;
                }
            }
        }

        const orphanGoogleEventIds = googleEvents
            .map((event) => event.id)
            .filter((id): id is string => Boolean(id) && !expectedGoogleIds.has(id) && !deletedGoogleIds.has(id));

        for (const eventId of orphanGoogleEventIds) {
            await deleteGoogleEventIfPresent(calendarId, eventId);
            stats.deleted += 1;
        }

        logGoogleSync('sync writes complete', stats);

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
                if (isRateLimitError(err)) throw err;
                if (!isMissingGoogleEventError(err) && !(err instanceof CalendarApiError && err.status === 403)) {
                    throw err;
                }
            }
        }

        // The app-created scope cannot list the user's calendars, so when the
        // stored id is unusable we start a fresh app-owned calendar.
        return calendarService.createCalendar('Calendy');
    }, [calendarService]);

    const recoverMissingCalendar = useCallback(async (currentSettings: GoogleSyncSettings) => {
        const calendar = await findOrCreateCalendar(currentSettings.calendarId);
        if (!calendar.id) throw new Error('Google did not return a calendar id.');

        const nextSettings: GoogleSyncSettings = {
            ...currentSettings,
            calendarId: calendar.id,
            calendarSummary: calendar.summary || currentSettings.calendarSummary || 'Calendy',
            accountEmail: currentSettings.accountEmail ?? userEmail ?? undefined
        };

        await saveSettings(nextSettings);
        return calendar.id;
    }, [findOrCreateCalendar, saveSettings, userEmail]);

    const getRateLimitCooldownMs = useCallback(() => (
        Math.max(0, rateLimitCooldownUntilRef.current - Date.now())
    ), []);

    const clearRateLimitCooldown = useCallback(() => {
        rateLimitCooldownUntilRef.current = 0;
        rateLimitBackoffMsRef.current = RATE_LIMIT_INITIAL_COOLDOWN_MS;
        if (rateLimitRetryTimeoutRef.current) {
            clearTimeout(rateLimitRetryTimeoutRef.current);
            rateLimitRetryTimeoutRef.current = null;
        }
    }, []);

    const startRateLimitCooldown = useCallback((err: unknown) => {
        const baseCooldownMs = rateLimitBackoffMsRef.current;
        const jitterMs = Math.floor(Math.random() * RATE_LIMIT_JITTER_MS);
        const cooldownMs = baseCooldownMs + jitterMs;
        rateLimitCooldownUntilRef.current = Date.now() + cooldownMs;
        rateLimitBackoffMsRef.current = Math.min(baseCooldownMs * 2, RATE_LIMIT_MAX_COOLDOWN_MS);
        warnGoogleSync('rate limited', {
            reason: err instanceof CalendarApiError ? err.reason : undefined,
            status: err instanceof CalendarApiError ? err.status : undefined,
            cooldownMs
        });
        return cooldownMs;
    }, []);

    const scheduleRateLimitRetry = useCallback((cooldownMs: number, retry: () => void) => {
        if (rateLimitRetryTimeoutRef.current) {
            clearTimeout(rateLimitRetryTimeoutRef.current);
        }

        rateLimitRetryTimeoutRef.current = setTimeout(() => {
            rateLimitRetryTimeoutRef.current = null;
            logGoogleSync('retrying after rate-limit cooldown');
            retry();
        }, cooldownMs);
    }, []);

    const syncToGoogle = useCallback(async (interactive = false) => {
        const currentSettings = settingsRef.current;
        if (!userUid || !userEmail || !isHydrated || !currentSettings?.enabled) return;

        if (syncTimeoutRef.current) {
            clearTimeout(syncTimeoutRef.current);
            syncTimeoutRef.current = null;
        }

        const localSyncFingerprint = getLocalSyncFingerprint(currentSettings.calendarId, eventsRef.current);
        if (!interactive && localSyncFingerprint === lastSuccessfulSyncFingerprintRef.current) {
            logGoogleSync('background sync skipped; local events unchanged');
            return;
        }

        const activeCooldownMs = getRateLimitCooldownMs();
        if (activeCooldownMs > 0) {
            const message = formatCooldownMessage(activeCooldownMs);
            logGoogleSync('sync skipped during rate-limit cooldown', { cooldownMs: activeCooldownMs, interactive });
            setError(interactive ? message : null);
            if (interactive) toast.error(message);
            return;
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
            logGoogleSync('sync started', {
                calendarId: currentSettings.calendarId,
                localEvents: eventsRef.current.length,
                interactive
            });
            let calendarId = currentSettings.calendarId;
            let updates: Array<{ eventId: string; gcalEventId?: string }>;

            try {
                updates = await pushLocalEventsToGoogle(calendarId, eventsRef.current);
            } catch (err) {
                if (!isMissingGoogleEventError(err)) throw err;

                calendarId = await recoverMissingCalendar(currentSettings);
                const recoveredCalendarEvents = calendarId === currentSettings.calendarId
                    ? eventsRef.current
                    : withoutGoogleEventIds(eventsRef.current);
                const recoveredCalendarUpdates = await pushLocalEventsToGoogle(calendarId, recoveredCalendarEvents);
                updates = calendarId === currentSettings.calendarId
                    ? recoveredCalendarUpdates
                    : [...clearGoogleEventIdUpdates(eventsRef.current), ...recoveredCalendarUpdates];
            }

            // Keep queued syncs from seeing stale missing gcal ids before React commits the metadata update.
            eventsRef.current = applyGoogleEventIdUpdates(eventsRef.current, updates);
            stampGoogleEventIds(updates);
            lastSuccessfulSyncFingerprintRef.current = getLocalSyncFingerprint(calendarId, eventsRef.current);
            setAuthorizationRequired(false);
            clearRateLimitCooldown();
            logGoogleSync('sync finished', { metadataUpdates: updates.length });
        } catch (err) {
            if (isRateLimitError(err)) {
                const cooldownMs = startRateLimitCooldown(err);
                syncQueuedRef.current = false;
                scheduleRateLimitRetry(cooldownMs, () => {
                    void syncToGoogle(false);
                });
                const message = formatCooldownMessage(cooldownMs);
                setError(interactive ? message : null);
                if (interactive) toast.error(message);
                return;
            }

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
        clearRateLimitCooldown,
        ensureCalendarAccess,
        getRateLimitCooldownMs,
        isHydrated,
        pushLocalEventsToGoogle,
        recoverMissingCalendar,
        scheduleRateLimitRetry,
        stampGoogleEventIds,
        startRateLimitCooldown,
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
        if (!settings?.enabled || !isHydrated || didInitialEnabledSyncRef.current) return;

        didInitialEnabledSyncRef.current = true;
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
            const activeCooldownMs = getRateLimitCooldownMs();
            if (activeCooldownMs > 0) {
                const message = formatCooldownMessage(activeCooldownMs);
                setError(message);
                toast.error(message);
                logGoogleSync('reconnect skipped during rate-limit cooldown', { cooldownMs: activeCooldownMs });
                return false;
            }

            await calendarService.requestInteractiveToken(userEmail);
            const calendar = await findOrCreateCalendar(settingsRef.current?.calendarId);

            if (!calendar.id) {
                throw new Error('Google did not return a calendar id.');
            }

            const currentCalendarId = settingsRef.current?.calendarId;
            const isMovingCalendar = Boolean(currentCalendarId && currentCalendarId !== calendar.id);
            if (isMovingCalendar) {
                const updates = clearGoogleEventIdUpdates(eventsRef.current);
                eventsRef.current = applyGoogleEventIdUpdates(eventsRef.current, updates);
                stampGoogleEventIds(updates);
                lastSuccessfulSyncFingerprintRef.current = null;
            }

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

            didInitialEnabledSyncRef.current = true;
            scheduleSyncToGoogle();
            logGoogleSync('calendar connected; sync scheduled', { calendarId: calendar.id, movedCalendar: isMovingCalendar });
            toast.success('Google Calendar sync is connected.');
            return true;
        } catch (err) {
            if (isRateLimitError(err)) {
                const cooldownMs = startRateLimitCooldown(err);
                scheduleRateLimitRetry(cooldownMs, () => {
                    void syncToGoogle(false);
                });
                const message = formatCooldownMessage(cooldownMs);
                setError(message);
                toast.error(message);
                return false;
            }

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
        getRateLimitCooldownMs,
        saveSettings,
        scheduleRateLimitRetry,
        scheduleSyncToGoogle,
        stampGoogleEventIds,
        startRateLimitCooldown,
        syncToGoogle,
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
            didInitialEnabledSyncRef.current = false;
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
