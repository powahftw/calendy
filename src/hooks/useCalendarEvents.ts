import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    calendarService,
    isCalendarAuthorizationError,
    isCalendarRateLimitError
} from '../services/CalendarService';
import { CalendarEvent, toCalendarEvents } from '../utils/calendarEvents';
import {
    EVENT_CACHE_TTL_MS,
    isCacheFresh,
    readCachedEvents,
    writeCachedEvents
} from '../utils/eventCache';
import { logger } from '../utils/logger';
import { getUserFacingErrorMessage } from '../utils/userFacingErrors';

/** The years a view spans, so events are fetched and cached year by year. */
const getViewYears = (year: number, startMonth: number, monthsToShow: number): number[] => (
    [...new Set(
        Array.from({ length: monthsToShow }, (_, i) => year + Math.floor((startMonth + i) / 12))
    )]
);

/** Google wants RFC3339 instants; a whole local year is [Jan 1, next Jan 1). */
const getYearBounds = (year: number) => ({
    timeMin: new Date(year, 0, 1).toISOString(),
    timeMax: new Date(year + 1, 0, 1).toISOString()
});

export interface CalendarEventsState {
    events: CalendarEvent[];
    loading: boolean;
    /** True while refreshing in the background with cached events on screen. */
    refreshing: boolean;
    error: string | null;
    lastFetchedAt: number | null;
    refresh: () => Promise<void>;
}

interface UseCalendarEventsOptions {
    calendarId: string | null;
    year: number;
    startMonth: number;
    monthsToShow: number;
    /** Attempts a silent token refresh before fetching. */
    ensureAccess: () => Promise<boolean>;
}

const collectCached = (calendarId: string, years: number[]) => {
    const events: CalendarEvent[] = [];
    const staleYears: number[] = [];
    let oldestFetchedAt: number | null = null;

    for (const year of years) {
        const cached = readCachedEvents(calendarId, year);
        if (cached) {
            events.push(...cached.events);
            oldestFetchedAt = oldestFetchedAt === null
                ? cached.fetchedAt
                : Math.min(oldestFetchedAt, cached.fetchedAt);
        }

        if (!isCacheFresh(cached)) staleYears.push(year);
    }

    return { events, staleYears, oldestFetchedAt, hasAnyCache: events.length > 0 || oldestFetchedAt !== null };
};

/**
 * Reads events straight from Google, cached client-side per calendar-year.
 * Nothing here is persisted server side - Firestore only holds which calendar
 * to read.
 */
export const useCalendarEvents = ({
    calendarId,
    year,
    startMonth,
    monthsToShow,
    ensureAccess
}: UseCalendarEventsOptions): CalendarEventsState => {
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);
    // Identifies what the in-flight load is fetching, so a load for a
    // *different* calendar or range is never swallowed by the re-entrancy
    // guard, and a superseded response is never written to state.
    const inFlightKeyRef = useRef<string | null>(null);
    const latestRequestRef = useRef(0);

    const years = useMemo(
        () => getViewYears(year, startMonth, monthsToShow),
        [monthsToShow, startMonth, year]
    );
    const yearsKey = years.join(',');

    const load = useCallback(async (force: boolean) => {
        if (!calendarId) {
            setEvents([]);
            setLastFetchedAt(null);
            return;
        }

        const requestKey = `${calendarId}|${years.join(',')}`;
        // Only skip when an identical load is already running.
        if (inFlightKeyRef.current === requestKey) return;

        const requestId = ++latestRequestRef.current;
        const isCurrent = () => latestRequestRef.current === requestId;

        const cached = collectCached(calendarId, years);
        const yearsToFetch = force ? years : cached.staleYears;

        // Show whatever is cached immediately, even when it is stale.
        if (cached.hasAnyCache) {
            setEvents(cached.events);
            setLastFetchedAt(cached.oldestFetchedAt);
        }

        if (yearsToFetch.length === 0) {
            setError(null);
            return;
        }

        inFlightKeyRef.current = requestKey;
        if (cached.hasAnyCache) setRefreshing(true);
        else setLoading(true);

        try {
            const hasAccess = await ensureAccess();
            if (!hasAccess) {
                if (isCurrent() && !cached.hasAnyCache) {
                    setError('Reconnect Google Calendar to load your events.');
                }
                return;
            }

            const fetchedAt = Date.now();
            const fetchedYears = await Promise.all(
                yearsToFetch.map(async (fetchYear) => {
                    const { timeMin, timeMax } = getYearBounds(fetchYear);
                    const googleEvents = await calendarService.listEvents(calendarId, timeMin, timeMax);
                    return { year: fetchYear, events: toCalendarEvents(googleEvents) };
                })
            );

            for (const fetched of fetchedYears) {
                writeCachedEvents(calendarId, fetched.year, fetched.events, fetchedAt);
            }

            // A newer load (calendar switch, range change) has taken over.
            if (!isCurrent()) return;

            // Re-read so untouched years keep their cached copies.
            const merged = collectCached(calendarId, years);
            setEvents(merged.events);
            setLastFetchedAt(merged.oldestFetchedAt);
            setError(null);
        } catch (err) {
            logger.error('Failed to load Google Calendar events', err);
            if (!isCurrent()) return;

            if (isCalendarAuthorizationError(err)) {
                calendarService.clearAccessToken();
                setError('Reconnect Google Calendar to load your events.');
            } else if (isCalendarRateLimitError(err)) {
                setError('Google is rate limiting requests. Showing the last cached events.');
            } else {
                setError(getUserFacingErrorMessage(err, 'Could not load events from Google Calendar.'));
            }
        } finally {
            if (inFlightKeyRef.current === requestKey) inFlightKeyRef.current = null;
            if (isCurrent()) {
                setLoading(false);
                setRefreshing(false);
            }
        }
    }, [calendarId, ensureAccess, years]);

    useEffect(() => {
        void load(false);
        // `years` is captured through `load`; yearsKey keeps the effect stable
        // when the array identity changes but its contents do not.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [calendarId, yearsKey]);

    useEffect(() => {
        if (!calendarId) return;

        const refreshIfStale = () => {
            if (document.visibilityState === 'hidden') return;
            void load(false);
        };

        // The TTL only bites when the app is actually being looked at, so poll
        // on an interval and on refocus rather than waking a background tab.
        const interval = window.setInterval(refreshIfStale, EVENT_CACHE_TTL_MS);
        window.addEventListener('focus', refreshIfStale);
        document.addEventListener('visibilitychange', refreshIfStale);

        return () => {
            window.clearInterval(interval);
            window.removeEventListener('focus', refreshIfStale);
            document.removeEventListener('visibilitychange', refreshIfStale);
        };
    }, [calendarId, load]);

    const refresh = useCallback(() => load(true), [load]);

    return useMemo(() => ({
        events,
        loading,
        refreshing,
        error,
        lastFetchedAt,
        refresh
    }), [error, events, lastFetchedAt, loading, refresh, refreshing]);
};
