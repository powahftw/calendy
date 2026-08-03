import { useEffect, useRef, useCallback, useReducer, useState } from 'react';
import { User } from 'firebase/auth';
import { serverTimestamp } from 'firebase/firestore';
import { PlannerSettings, ThemeId } from '../utils/calendarUtils';
import { plannerReducer, PlannerState } from './usePlannerState';
import { loadFromLocalStorage, saveToLocalStorage, getDefaultSettings, getTimestampInMillis } from '../utils/persistence';
import { syncSettings, subscribeToSettings } from '../firestoreSync';
import { logger } from '../utils/logger';

const FIRESTORE_SYNC_DELAY_MS = 500;
const LOCAL_STORAGE_DELAY_MS = 50;

const initialState: PlannerState = {
    settings: getDefaultSettings(),
    updatedAt: 0,
    isDirty: false,
    isHydrated: false
};

const getInitialOnlineState = () => (
    typeof navigator === 'undefined' ? true : navigator.onLine
);

/**
 * Persists planner settings - and nothing else. Events are read live from
 * Google Calendar; see useCalendarEvents.
 *
 * localStorage is a warm-start cache so the grid does not flash default
 * settings while Firestore answers. Firestore is the sync channel, including
 * between tabs, which its snapshot listener already handles.
 */
const usePlannerPersistence = (user: User) => {
    const [state, dispatch] = useReducer(plannerReducer, initialState);
    const [isOnline, setIsOnline] = useState(getInitialOnlineState);
    const userUid = user.uid;
    const { isDirty, updatedAt, isHydrated } = state;

    const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const localStorageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const local = loadFromLocalStorage(userUid);
        dispatch({ type: 'HYDRATE_LOCAL', settings: local.settings, updatedAt: local.updatedAt, isDirty: local.pendingSync });
    }, [userUid]);

    useEffect(() => {
        logger.info('Setting up Firestore listener for', userUid);

        return subscribeToSettings(userUid, ({ updatedAt: remoteUpdatedAt, ...settings }) => {
            dispatch({ type: 'REMOTE_UPDATE', settings, updatedAt: getTimestampInMillis(remoteUpdatedAt) });
        });
    }, [userUid]);

    const performRemoteSync = useCallback(async () => {
        logger.info('Syncing local settings to Firestore');
        const syncedAt = updatedAt;

        if (await syncSettings(userUid, state.settings, serverTimestamp())) {
            dispatch({ type: 'SYNC_CONFIRMED', updatedAt: syncedAt });
        }
    }, [state.settings, updatedAt, userUid]);

    useEffect(() => {
        if (!isHydrated) return;

        if (localStorageTimeoutRef.current) clearTimeout(localStorageTimeoutRef.current);
        localStorageTimeoutRef.current = setTimeout(() => {
            saveToLocalStorage(userUid, state.settings, updatedAt, isDirty);
        }, LOCAL_STORAGE_DELAY_MS);

        if (isDirty && isOnline) {
            if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
            syncTimeoutRef.current = setTimeout(() => void performRemoteSync(), FIRESTORE_SYNC_DELAY_MS);
        }

        return () => {
            if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
            if (localStorageTimeoutRef.current) clearTimeout(localStorageTimeoutRef.current);
        };
    }, [state.settings, isDirty, isHydrated, isOnline, performRemoteSync, updatedAt, userUid]);

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

    const updateSettings = useCallback((updates: Partial<PlannerSettings>) => {
        dispatch({ type: 'USER_CHANGE', settings: updates, updatedAt: Date.now() });
    }, []);

    // Theme is the one setting worth its own setter: it is set from a list of
    // cards where a generic `updateSettings({ theme })` would read worse.
    const setTheme = useCallback((theme: ThemeId) => updateSettings({ theme }), [updateSettings]);

    /** Steps the view forward or back by exactly one visible range. */
    const navigate = useCallback((direction: 1 | -1) => {
        const { year, startMonth, monthsToShow } = state.settings;
        const months = year * 12 + startMonth + direction * monthsToShow;

        updateSettings({ year: Math.floor(months / 12), startMonth: months % 12 });
    }, [state.settings, updateSettings]);

    return {
        settings: state.settings,
        updateSettings,
        setTheme,
        navigate,
        syncStatus: !isOnline ? 'offline' : isDirty ? 'pending' : 'synced'
    } as const;
};

export default usePlannerPersistence;
