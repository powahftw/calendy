import { useEffect, useRef, useCallback, useReducer, useState } from 'react';
import { User } from 'firebase/auth';
import { serverTimestamp } from 'firebase/firestore';
import { PlannerEvent, PlannerSettings, ThemeId } from '../utils/calendarUtils';
import {
    plannerReducer,
    PlannerState
} from './usePlannerState';
import {
    loadFromLocalStorage,
    saveToLocalStorage,
    getDefaultData,
    getTimestampInMillis
} from '../utils/persistence';
import {
    syncEvents,
    syncSettings,
    subscribeToEvents,
    subscribeToSettings,
    loadEvents,
    loadSettings
} from '../firestoreSync';
import { logger } from '../utils/logger';

const FIRESTORE_SYNC_DELAY_MS = 500;

const initialState: PlannerState = {
    data: getDefaultData(),
    history: [],
    metadata: {
        lastActionType: null,
        updatedAt: 0,
        eventsUpdatedAt: 0,
        settingsUpdatedAt: 0,
        dirtySlices: {
            events: false,
            settings: false
        },
        isHydrated: false
    }
};

const getInitialOnlineState = () => (
    typeof navigator === 'undefined' ? true : navigator.onLine
);

const usePlannerPersistence = (user: User | null) => {
    const [state, dispatch] = useReducer(plannerReducer, initialState);
    const [isOnline, setIsOnline] = useState(getInitialOnlineState);
    const userUid = user?.uid ?? null;
    const currentUserRef = useRef<string>(user?.uid ?? 'guest');
    const isFirstLoad = useRef(true);

    const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const localStorageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hasPendingSync = state.metadata.dirtySlices.events || state.metadata.dirtySlices.settings;
    const isHydrated = state.metadata.isHydrated;
    const updatedAt = state.metadata.updatedAt;
    const lastActionType = state.metadata.lastActionType;

    useEffect(() => {
        const userId = userUid ?? 'guest';

        if (currentUserRef.current !== userId || isFirstLoad.current) {
            logger.info('User switched or first load, resetting state', { from: currentUserRef.current, to: userId });
            currentUserRef.current = userId;
            isFirstLoad.current = false;

            dispatch({ type: 'RESET', initialState });

            const localState = loadFromLocalStorage(userId);
            dispatch({
                type: 'HYDRATE_LOCAL',
                payload: localState.data,
                timestamp: localState.updatedAt || 0,
                pendingSync: Boolean(userUid && localState.pendingSync)
            });
        }
    }, [userUid]);

    useEffect(() => {
        if (!userUid) return;

        logger.info('Setting up Firestore listeners for', userUid);

        const initRemoteData = async () => {
            try {
                const [remoteEvents, remoteSettings] = await Promise.all([
                    loadEvents(userUid),
                    loadSettings(userUid)
                ]);

                if (remoteEvents) {
                    dispatch({
                        type: 'REMOTE_UPDATE',
                        payload: { events: remoteEvents.events },
                        timestamp: getTimestampInMillis(remoteEvents.updatedAt)
                    });
                }

                if (remoteSettings) {
                    const { updatedAt, ...settings } = remoteSettings;
                    dispatch({
                        type: 'REMOTE_UPDATE',
                        payload: { settings },
                        timestamp: getTimestampInMillis(updatedAt)
                    });
                }
            } catch (err) {
                logger.error('Failed to init remote data', err);
            }
        };

        initRemoteData();

        const unsubEvents = subscribeToEvents(userUid, (remotePayload) => {
            dispatch({
                type: 'REMOTE_UPDATE',
                payload: { events: remotePayload.events },
                timestamp: getTimestampInMillis(remotePayload.updatedAt)
            });
        });

        const unsubSettings = subscribeToSettings(userUid, (remoteSettings) => {
            const { updatedAt, ...settings } = remoteSettings;
            dispatch({
                type: 'REMOTE_UPDATE',
                payload: { settings },
                timestamp: getTimestampInMillis(updatedAt)
            });
        });

        return () => {
            unsubEvents();
            unsubSettings();
        };
    }, [userUid]);

    const performRemoteSync = useCallback(async () => {
        if (!userUid || !isHydrated) return false;
        if (!state.metadata.dirtySlices.events && !state.metadata.dirtySlices.settings) return true;

        logger.info('Syncing local planner state to Firestore', state.metadata.dirtySlices);

        const [eventsSynced, settingsSynced] = await Promise.all([
            state.metadata.dirtySlices.events
                ? syncEvents(userUid, state.data.events, serverTimestamp())
                : Promise.resolve(true),
            state.metadata.dirtySlices.settings
                ? syncSettings(userUid, state.data.settings, serverTimestamp())
                : Promise.resolve(true)
        ]);

        const syncedSlices = {
            events: state.metadata.dirtySlices.events && eventsSynced !== false,
            settings: state.metadata.dirtySlices.settings && settingsSynced !== false
        };

        if (syncedSlices.events || syncedSlices.settings) {
            dispatch({
                type: 'SYNC_CONFIRMED',
                slices: syncedSlices
            });
        }

        return eventsSynced !== false && settingsSynced !== false;
    }, [isHydrated, state.data.events, state.data.settings, state.metadata.dirtySlices, userUid]);

    useEffect(() => {
        if (!isHydrated) return;

        const userId = userUid ?? 'guest';

        if (localStorageTimeoutRef.current) clearTimeout(localStorageTimeoutRef.current);
        localStorageTimeoutRef.current = setTimeout(() => {
            logger.info('Saving state to LocalStorage for user:', userId);
            saveToLocalStorage(userId, state.data, updatedAt, hasPendingSync);
        }, 50);

        if (userUid && hasPendingSync && isOnline) {
            if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
            syncTimeoutRef.current = setTimeout(() => {
                void performRemoteSync();
            }, FIRESTORE_SYNC_DELAY_MS);
        }

        return () => {
            if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
            if (localStorageTimeoutRef.current) clearTimeout(localStorageTimeoutRef.current);
        };
    }, [
        state.data,
        isHydrated,
        updatedAt,
        hasPendingSync,
        isOnline,
        performRemoteSync,
        userUid
    ]);

    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);

            if (userUid && isHydrated && hasPendingSync) {
                logger.info('Back online with pending local changes. Syncing to Firestore...');
                void performRemoteSync();
            }
        };

        const handleOffline = () => {
            setIsOnline(false);
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [hasPendingSync, isHydrated, performRemoteSync, userUid]);

    useEffect(() => {
        if (!userUid || !isHydrated || !hasPendingSync || !isOnline) {
            return;
        }

        if (lastActionType === 'USER_CHANGE' || lastActionType === 'UNDO') {
            return;
        }

        logger.info('Found pending local changes after hydration. Syncing to Firestore...');
        void performRemoteSync();
    }, [
        hasPendingSync,
        isOnline,
        isHydrated,
        lastActionType,
        performRemoteSync,
        userUid
    ]);

    const updateState = useCallback((payload: { events?: PlannerEvent[]; settings?: Partial<PlannerSettings> }) => {
        dispatch({
            type: 'USER_CHANGE',
            payload,
            timestamp: Date.now()
        });
    }, []);

    const updateSettings = useCallback((updates: Partial<PlannerSettings>) => {
        dispatch({
            type: 'USER_CHANGE',
            payload: { settings: updates },
            timestamp: Date.now()
        });
    }, []);

    // Individual setters for backward compatibility with existing Context/Components
    const setEvents = useCallback((eventsOrUpdater: PlannerEvent[] | ((prev: PlannerEvent[]) => PlannerEvent[])) => {
        const newEvents = typeof eventsOrUpdater === 'function'
            ? eventsOrUpdater(state.data.events)
            : eventsOrUpdater;

        updateState({ events: newEvents });
    }, [state.data.events, updateState]);

    const setTheme = useCallback((theme: ThemeId) => updateSettings({ theme }), [updateSettings]);
    const setHighlightToday = useCallback((highlightToday: boolean) => updateSettings({ highlightToday }), [updateSettings]);
    const setShowWeekends = useCallback((showWeekends: boolean) => updateSettings({ showWeekends }), [updateSettings]);
    const setShowDayProgress = useCallback((showDayProgress: boolean) => updateSettings({ showDayProgress }), [updateSettings]);
    const setWeekdayAlign = useCallback((weekdayAlign: boolean) => updateSettings({ weekdayAlign }), [updateSettings]);
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

    const undo = useCallback(() => {
        dispatch({ type: 'UNDO' });
    }, []);

    return {
        events: state.data.events,
        ...state.data.settings,
        canUndo: state.history.length > 0,
        setEvents,
        setTheme,
        setHighlightToday,
        setShowWeekends,
        setShowDayProgress,
        setWeekdayAlign,
        setYear,
        setStartMonth,
        setMonthsToShow,
        navigate,
        undo,
        isInitialLoadDone: isHydrated,
        syncStatus: !userUid ? 'local-only' : !isOnline ? 'offline' : hasPendingSync ? 'pending' : 'synced'
    };
};

export default usePlannerPersistence;
