import { useCallback, useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import toast from 'react-hot-toast';
import {
    GoogleCalendar,
    calendarService,
    isCalendarAuthorizationError,
    isCalendarRateLimitError,
    isGoogleCalendarConfigured,
    preloadGoogleIdentityApi
} from '../services/CalendarService';
import { saveCalendarSelection, subscribeToCalendarSelection } from '../firestoreSync';
import { getSelectedCalendarIds, type CalendarSelection } from '../firestoreSync';
import { logger } from '../utils/logger';
import { getUserFacingErrorMessage } from '../utils/userFacingErrors';

export type CalendarConnectionStatus =
    /** No token yet, or the token lapsed and needs a user gesture to renew. */
    | 'disconnected'
    /** Connected, but the user has not picked a calendar to look at. */
    | 'needs-calendar'
    | 'connected';

export interface CalendarConnection {
    status: CalendarConnectionStatus;
    /** True once we know a token is needed but cannot be obtained silently. */
    authorizationRequired: boolean;
    connecting: boolean;
    calendars: GoogleCalendar[];
    calendarsLoading: boolean;
    selection: CalendarSelection | null;
    selectionLoading: boolean;
    error: string | null;
    connect: () => Promise<boolean>;
    toggleCalendar: (calendar: GoogleCalendar) => Promise<boolean>;
    /** Refreshes the token silently; used when returning to a backgrounded tab. */
    ensureAccess: () => Promise<boolean>;
}

const sortCalendars = (calendars: GoogleCalendar[]): GoogleCalendar[] => (
    [...calendars].sort((a, b) => {
        if (a.primary !== b.primary) return a.primary ? -1 : 1;
        return (a.summaryOverride || a.summary || '').localeCompare(b.summaryOverride || b.summary || '');
    })
);

export const getCalendarName = (calendar: GoogleCalendar): string => (
    calendar.summaryOverride || calendar.summary || calendar.id
);

const describeError = (err: unknown, fallback: string): string => (
    isCalendarRateLimitError(err)
        ? 'Google is rate limiting requests. Try again in a minute.'
        : getUserFacingErrorMessage(err, fallback)
);

export const useCalendarConnection = (user: User | null): CalendarConnection => {
    const userUid = user?.uid ?? null;
    const userEmail = user?.email ?? null;

    const [hasToken, setHasToken] = useState(() => calendarService.hasValidToken());
    const [authorizationRequired, setAuthorizationRequired] = useState(false);
    const [connecting, setConnecting] = useState(false);
    const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
    const [calendarsLoading, setCalendarsLoading] = useState(false);
    const [selection, setSelection] = useState<CalendarSelection | null>(null);
    const [selectionLoading, setSelectionLoading] = useState(Boolean(userUid));
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        preloadGoogleIdentityApi();
    }, []);

    useEffect(() => {
        if (!userUid) {
            setSelection(null);
            setSelectionLoading(false);
            return;
        }

        setSelectionLoading(true);
        return subscribeToCalendarSelection(userUid, (next) => {
            setSelection(next);
            setSelectionLoading(false);
        });
    }, [userUid]);

    const loadCalendars = useCallback(async () => {
        if (!calendarService.hasValidToken()) return;

        setCalendarsLoading(true);
        try {
            const list = await calendarService.listCalendars();
            setCalendars(sortCalendars(list));
            setError(null);
        } catch (err) {
            logger.error('Failed to list Google calendars', err);

            if (isCalendarAuthorizationError(err)) {
                calendarService.clearAccessToken();
                setHasToken(false);
                setAuthorizationRequired(true);
            }
            setError(describeError(err, 'Could not load your calendars.'));
        } finally {
            setCalendarsLoading(false);
        }
    }, []);

    /**
     * Tries to get a token without bothering the user. Google can still decide
     * a popup is needed, and popup blockers reject that outside a user gesture,
     * so a failure here just flips the UI into "reconnect" rather than erroring.
     */
    const ensureAccess = useCallback(async () => {
        if (calendarService.hasValidToken()) {
            setHasToken(true);
            setAuthorizationRequired(false);
            return true;
        }

        if (!userEmail || !isGoogleCalendarConfigured) {
            setAuthorizationRequired(true);
            return false;
        }

        try {
            await calendarService.requestAccessToken(userEmail);
            setHasToken(true);
            setAuthorizationRequired(false);
            return true;
        } catch (err) {
            logger.info('Silent Google Calendar token refresh failed', err);
            setHasToken(false);
            setAuthorizationRequired(true);
            return false;
        }
    }, [userEmail]);

    // On mount, and whenever the app comes back to the foreground, top the
    // token up. iOS PWAs get suspended aggressively and come back with a dead
    // token; without this the first fetch after a resume always fails.
    useEffect(() => {
        if (!userEmail) return;

        void ensureAccess();

        const handleVisibility = () => {
            if (document.visibilityState === 'visible' && !calendarService.hasValidToken()) {
                void ensureAccess();
            }
        };

        window.addEventListener('focus', handleVisibility);
        document.addEventListener('visibilitychange', handleVisibility);
        return () => {
            window.removeEventListener('focus', handleVisibility);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [ensureAccess, userEmail]);

    useEffect(() => {
        if (hasToken) void loadCalendars();
    }, [hasToken, loadCalendars]);

    const connect = useCallback(async () => {
        if (!userUid || !userEmail) {
            toast.error('Sign in to connect Google Calendar.');
            return false;
        }

        if (!isGoogleCalendarConfigured) {
            setError('Google Calendar is not configured for this deployment.');
            return false;
        }

        setConnecting(true);
        setError(null);

        try {
            await calendarService.requestAccessToken(userEmail);
            setHasToken(true);
            setAuthorizationRequired(false);
            await loadCalendars();
            return true;
        } catch (err) {
            logger.error('Google Calendar connection failed', err);
            const message = describeError(err, 'Could not connect to Google Calendar.');
            setError(message);
            toast.error(message);
            return false;
        } finally {
            setConnecting(false);
        }
    }, [loadCalendars, userEmail, userUid]);

    const toggleCalendar = useCallback(async (calendar: GoogleCalendar) => {
        if (!userUid) return false;

        const selectedIds = getSelectedCalendarIds(selection);
        const isSelected = selectedIds.includes(calendar.id);
        // A connected planner always needs at least one visible calendar.
        if (isSelected && selectedIds.length === 1) return true;

        const nextIds = isSelected
            ? selectedIds.filter((id) => id !== calendar.id)
            : [...selectedIds, calendar.id];
        const calendarById = new Map(calendars.map((item) => [item.id, item]));
        const nextNames = nextIds.map((id) => {
            const item = calendarById.get(id);
            return item ? getCalendarName(item) : id;
        });
        const next: CalendarSelection = {
            calendarId: nextIds[0],
            calendarSummary: nextNames[0],
            calendarIds: nextIds,
            calendarSummaries: nextNames,
            ...(userEmail ? { accountEmail: userEmail } : {})
        };

        const saved = await saveCalendarSelection(userUid, next);
        if (saved) {
            setSelection(next);
            setError(null);
        } else {
            toast.error('Could not save your calendar choice.');
        }
        return saved;
    }, [calendars, selection, userEmail, userUid]);

    const status: CalendarConnectionStatus = !hasToken
        ? 'disconnected'
        : selection
            ? 'connected'
            : 'needs-calendar';

    // A calendar that disappeared (unshared, deleted) should not silently show
    // an empty year.
    useEffect(() => {
        if (!selection || calendars.length === 0) return;
        const missing = getSelectedCalendarIds(selection).filter(
            (id) => !calendars.some((calendar) => calendar.id === id)
        );
        if (missing.length === 0) return;

        setError('One or more selected calendars are no longer available on this account. Update your calendar selection.');
    }, [calendars, selection]);

    return useMemo(() => ({
        status,
        authorizationRequired,
        connecting,
        calendars,
        calendarsLoading,
        selection,
        selectionLoading,
        error,
        connect,
        toggleCalendar,
        ensureAccess
    }), [
        authorizationRequired,
        calendars,
        calendarsLoading,
        connect,
        connecting,
        ensureAccess,
        error,
        toggleCalendar,
        selection,
        selectionLoading,
        status
    ]);
};
