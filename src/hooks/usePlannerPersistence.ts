import { useEffect, useRef, useCallback, useReducer, useState } from 'react';
import { User } from 'firebase/auth';
import { serverTimestamp } from 'firebase/firestore';
import { PlannerSettings, ThemeId } from '../utils/calendarUtils';
import { plannerReducer, PlannerState } from './usePlannerState';
import {
    loadFromLocalStorage,
    saveToLocalStorage,
    getDefaultData,
    getLocalStorageKey,
    getTimestampInMillis,
    parseLocalStorageState
} from '../utils/persistence';
import { syncSettings, subscribeToSettings, loadSettings } from '../firestoreSync';
import { logger } from '../utils/logger';

const FIRESTORE_SYNC_DELAY_MS = 500;

const initialState: PlannerState = {
    data: getDefaultData(),
    metadata: {
        lastActionType: null,
        settingsUpdatedAt: 0,
        isDirty: false,
        isHydrated: false
    }
};

const getInitialOnlineState = () => (
    typeof navigator === 'undefined' ? true : navigator.onLine
);

/**
 * Persists planner settings - and nothing else. Events are read live from
 * Google Calendar; see useCalendarEvents.
 */
const usePlannerPersistence = (user: User | null) => {
    const [state, dispatch] = useReducer(plannerReducer, initialState);
    const [isOnline, setIsOnline] = useState(getInitialOnlineState);
    const userUid = user?.uid ?? null;
    const currentUserRef = useRef<string | null>(null);
    const isFirstLoad = useRef(true);

    const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const localStorageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const { isDirty, settingsUpdatedAt, isHydrated, lastActionType } = state.metadata;

    useEffect(() => {
        if (!userUid) return;

        if (currentUserRef.current !== userUid || isFirstLoad.current) {
            logger.info('User switched or first load, resetting state', { from: currentUserRef.current, to: userUid });
            currentUserRef.current = userUid;
            isFirstLoad.current = false;

            dispatch({ type: 'RESET', initialState });

            const localState = loadFromLocalStorage(userUid);
            dispatch({
                type: 'HYDRATE_LOCAL',
                payload: localState.data,
                settingsUpdatedAt: localState.updatedAt,
                pendingSync: localState.pendingSync
            });
        }
    }, [userUid]);

    useEffect(() => {
        if (!userUid) return;

        logger.info('Setting up Firestore listener for', userUid);

        const initRemoteData = async () => {
            try {
                const remoteSettings = await loadSettings(userUid);
                if (!remoteSettings) return;

                const { updatedAt, ...settings } = remoteSettings;
                dispatch({
                    type: 'REMOTE_UPDATE',
                    payload: settings,
                    timestamp: getTimestampInMillis(updatedAt)
                });
            } catch (err) {
                logger.error('Failed to init remote settings', err);
            }
        };

        void initRemoteData();

        return subscribeToSettings(userUid, (remoteSettings) => {
            const { updatedAt, ...settings } = remoteSettings;
            dispatch({
                type: 'REMOTE_UPDATE',
                payload: settings,
                timestamp: getTimestampInMillis(updatedAt)
            });
        });
    }, [userUid]);

    const performRemoteSync = useCallback(async () => {
        if (!userUid || !isHydrated || !isDirty) return true;

        logger.info('Syncing local settings to Firestore');
        const syncedAt = settingsUpdatedAt;
        const synced = await syncSettings(userUid, state.data.settings, serverTimestamp());

        if (synced) {
            dispatch({ type: 'SYNC_CONFIRMED', settingsUpdatedAt: syncedAt });
        }

        return synced;
    }, [isDirty, isHydrated, settingsUpdatedAt, state.data.settings, userUid]);

    useEffect(() => {
        if (!isHydrated || !userUid) return;

        if (localStorageTimeoutRef.current) clearTimeout(localStorageTimeoutRef.current);
        localStorageTimeoutRef.current = setTimeout(() => {
            saveToLocalStorage(userUid, state.data, settingsUpdatedAt, isDirty);
        }, 50);

        if (isDirty && isOnline) {
            if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
            syncTimeoutRef.current = setTimeout(() => {
                void performRemoteSync();
            }, FIRESTORE_SYNC_DELAY_MS);
        }

        return () => {
            if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
            if (localStorageTimeoutRef.current) clearTimeout(localStorageTimeoutRef.current);
        };
    }, [state.data, isDirty, isHydrated, isOnline, performRemoteSync, settingsUpdatedAt, userUid]);

    useEffect(() => {
        if (!isHydrated || !userUid) return;

        const storageKey = getLocalStorageKey(userUid);

        const handleStorage = (event: StorageEvent) => {
            if (event.key !== storageKey || event.newValue === null) return;
            if (event.storageArea && event.storageArea !== localStorage) return;

            const incomingState = parseLocalStorageState(event.newValue);
            if (!incomingState) {
                logger.warn('Ignoring invalid planner LocalStorage update from another tab');
                return;
            }

            dispatch({
                type: 'LOCAL_STORAGE_UPDATE',
                payload: incomingState.data,
                settingsUpdatedAt: incomingState.updatedAt,
                pendingSync: incomingState.pendingSync
            });
        };

        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, [isHydrated, userUid]);

    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);

            if (userUid && isHydrated && isDirty) {
                logger.info('Back online with pending local changes. Syncing to Firestore...');
                void performRemoteSync();
            }
        };

        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [isDirty, isHydrated, performRemoteSync, userUid]);

    useEffect(() => {
        if (!userUid || !isHydrated || !isDirty || !isOnline) return;
        if (lastActionType === 'USER_CHANGE') return;

        logger.info('Found pending local changes after hydration. Syncing to Firestore...');
        void performRemoteSync();
    }, [isDirty, isOnline, isHydrated, lastActionType, performRemoteSync, userUid]);

    const updateSettings = useCallback((updates: Partial<PlannerSettings>) => {
        dispatch({ type: 'USER_CHANGE', payload: updates, timestamp: Date.now() });
    }, []);

    const setTheme = useCallback((theme: ThemeId) => updateSettings({ theme }), [updateSettings]);
    const setHighlightToday = useCallback((highlightToday: boolean) => updateSettings({ highlightToday }), [updateSettings]);
    const setShowWeekends = useCallback((showWeekends: boolean) => updateSettings({ showWeekends }), [updateSettings]);
    const setShowDayProgress = useCallback((showDayProgress: boolean) => updateSettings({ showDayProgress }), [updateSettings]);
    const setWeekdayAlign = useCallback((weekdayAlign: boolean) => updateSettings({ weekdayAlign }), [updateSettings]);
    const setPillUnmarkedEvents = useCallback(
        (pillUnmarkedEvents: boolean) => updateSettings({ pillUnmarkedEvents }),
        [updateSettings]
    );
    const setYear = useCallback((year: number | ((prev: number) => number)) => {
        const newYear = typeof year === 'function' ? year(state.data.settings.year) : year;
        updateSettings({ year: newYear });
    }, [state.data.settings.year, updateSettings]);
    const setStartMonth = useCallback((startMonth: number) => updateSettings({ startMonth }), [updateSettings]);
    const setMonthsToShow = useCallback((monthsToShow: number) => updateSettings({ monthsToShow }), [updateSettings]);

    const navigate = useCallback((direction: 1 | -1) => {
        const { year, startMonth, monthsToShow } = state.data.settings;
        let newYear = year;
        let newStartMonth = startMonth + (direction * monthsToShow);

        while (newStartMonth >= 12) {
            newYear += 1;
            newStartMonth -= 12;
        }
        while (newStartMonth < 0) {
            newYear -= 1;
            newStartMonth += 12;
        }

        updateSettings({ year: newYear, startMonth: newStartMonth });
    }, [state.data.settings, updateSettings]);

    return {
        ...state.data.settings,
        setTheme,
        setHighlightToday,
        setShowWeekends,
        setShowDayProgress,
        setWeekdayAlign,
        setPillUnmarkedEvents,
        setYear,
        setStartMonth,
        setMonthsToShow,
        navigate,
        isInitialLoadDone: isHydrated,
        syncStatus: !isOnline ? 'offline' : isDirty ? 'pending' : 'synced'
    };
};

export default usePlannerPersistence;
