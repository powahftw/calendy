import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { serverTimestamp } from 'firebase/firestore';
import type { CalendarEvent } from '../utils/calendarEvents';
import { EVENT_STYLE_COUNT } from '../utils/calendarUtils';
import {
    subscribeToEventStyleOverrides,
    syncEventStyleOverrides,
    type EventStyleOverrides
} from '../firestoreSync';
import { logger } from '../utils/logger';

const STORAGE_PREFIX = 'calendy_event_styles_v1_';
const FIRESTORE_SYNC_DELAY_MS = 650;

interface LocalEventStyleState {
    styles: EventStyleOverrides;
    updatedAt: number;
    pendingSync: boolean;
}

interface HookState extends LocalEventStyleState {
    calendarId: string | null;
}

const emptyLocalState = (): LocalEventStyleState => ({
    styles: {},
    updatedAt: 0,
    pendingSync: false
});

const getStorageKey = (calendarId: string) => `${STORAGE_PREFIX}${calendarId}`;

const isStyleOverrides = (value: unknown): value is EventStyleOverrides => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return Object.values(value).every((style) => (
        Number.isInteger(style) && Number(style) >= 0 && Number(style) < EVENT_STYLE_COUNT
    ));
};

const isLocalEventStyleState = (value: unknown): value is LocalEventStyleState => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const state = value as Record<string, unknown>;
    return isStyleOverrides(state.styles)
        && typeof state.updatedAt === 'number'
        && Number.isFinite(state.updatedAt)
        && typeof state.pendingSync === 'boolean';
};

const writeEventStyleState = (calendarId: string, state: LocalEventStyleState) => {
    if (!calendarId || typeof localStorage === 'undefined') return;

    try {
        localStorage.setItem(getStorageKey(calendarId), JSON.stringify(state));
    } catch (error) {
        logger.warn('Failed to save event style overrides', error);
    }
};

const readEventStyleState = (calendarId: string): LocalEventStyleState => {
    if (!calendarId || typeof localStorage === 'undefined') return emptyLocalState();

    try {
        const raw = localStorage.getItem(getStorageKey(calendarId));
        if (!raw) return emptyLocalState();

        const parsed: unknown = JSON.parse(raw);
        if (isLocalEventStyleState(parsed)) return parsed;

        // Migrate the PR's original styles-only format and queue it for its
        // first Firestore sync without losing a choice already made locally.
        if (isStyleOverrides(parsed)) {
            const migrated = {
                styles: parsed,
                updatedAt: Date.now(),
                pendingSync: true
            };
            writeEventStyleState(calendarId, migrated);
            return migrated;
        }

        return emptyLocalState();
    } catch (error) {
        logger.warn('Failed to read event style overrides', error);
        return emptyLocalState();
    }
};

const getInitialOnlineState = () => (
    typeof navigator === 'undefined' ? true : navigator.onLine
);

export const useEventStyleOverrides = (
    userUid: string,
    calendarId: string | null,
    sourceEvents: CalendarEvent[]
) => {
    const [state, setState] = useState<HookState>(() => ({
        calendarId,
        ...(calendarId ? readEventStyleState(calendarId) : emptyLocalState())
    }));
    const [isOnline, setIsOnline] = useState(getInitialOnlineState);
    const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        setState({
            calendarId,
            ...(calendarId ? readEventStyleState(calendarId) : emptyLocalState())
        });
    }, [calendarId]);

    useEffect(() => {
        if (!calendarId) return;

        return subscribeToEventStyleOverrides(userUid, calendarId, (remote) => {
            setState((current) => {
                // A local pending choice wins until Firestore acknowledges it.
                // Otherwise Firestore is authoritative; comparing a server time
                // with a possibly skewed device clock would be unreliable.
                if (current.calendarId !== calendarId
                    || current.pendingSync
                    || remote.updatedAt <= 0) {
                    return current;
                }

                const next = {
                    calendarId,
                    styles: remote.styles,
                    updatedAt: remote.updatedAt,
                    pendingSync: false
                };
                writeEventStyleState(calendarId, next);
                return next;
            });
        });
    }, [calendarId, userUid]);

    const performRemoteSync = useCallback(async () => {
        if (!calendarId || state.calendarId !== calendarId || !state.pendingSync) return;

        const syncedAt = state.updatedAt;
        const didSync = await syncEventStyleOverrides(
            userUid,
            calendarId,
            state.styles,
            serverTimestamp()
        );
        if (!didSync) return;

        setState((current) => {
            if (current.calendarId !== calendarId
                || current.updatedAt !== syncedAt
                || !current.pendingSync) {
                return current;
            }

            const next = { ...current, pendingSync: false };
            writeEventStyleState(calendarId, next);
            return next;
        });
    }, [calendarId, state, userUid]);

    useEffect(() => {
        if (!calendarId || state.calendarId !== calendarId || !state.pendingSync || !isOnline) return;

        if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = setTimeout(() => void performRemoteSync(), FIRESTORE_SYNC_DELAY_MS);

        return () => {
            if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
        };
    }, [calendarId, isOnline, performRemoteSync, state.calendarId, state.pendingSync]);

    useEffect(() => {
        if (!calendarId) return;
        const storageKey = getStorageKey(calendarId);

        const handleStorage = (event: StorageEvent) => {
            if (event.key !== storageKey || event.newValue === null) return;
            if (event.storageArea && event.storageArea !== localStorage) return;

            try {
                const incoming: unknown = JSON.parse(event.newValue);
                if (!isLocalEventStyleState(incoming)) return;

                setState((current) => (
                    current.calendarId === calendarId && incoming.updatedAt > current.updatedAt
                        ? { calendarId, ...incoming }
                        : current
                ));
            } catch (error) {
                logger.warn('Ignoring invalid event style update from another tab', error);
            }
        };

        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, [calendarId]);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    const events = useMemo(() => {
        const styles = state.calendarId === calendarId ? state.styles : {};
        return sourceEvents.map((event) => ({
            ...event,
            color: styles[event.styleKey] ?? event.automaticColor
        }));
    }, [calendarId, sourceEvents, state.calendarId, state.styles]);

    const cycleEventStyle = useCallback((event: CalendarEvent) => {
        if (!calendarId) return;

        setState((current) => {
            if (current.calendarId !== calendarId) return current;

            const resolvedStyle = current.styles[event.styleKey] ?? event.automaticColor;
            const nextStyle = (resolvedStyle + 1) % EVENT_STYLE_COUNT;
            const styles = { ...current.styles };

            // Cycling back to the automatic appearance removes the override.
            // The empty map is still synced so the removal reaches all devices.
            if (nextStyle === event.automaticColor) delete styles[event.styleKey];
            else styles[event.styleKey] = nextStyle;

            const next = {
                calendarId,
                styles,
                updatedAt: Math.max(Date.now(), current.updatedAt + 1),
                pendingSync: true
            };
            writeEventStyleState(calendarId, next);
            return next;
        });
    }, [calendarId]);

    return {
        events,
        cycleEventStyle,
        syncStatus: !isOnline ? 'offline' : state.pendingSync ? 'pending' : 'synced'
    } as const;
};
