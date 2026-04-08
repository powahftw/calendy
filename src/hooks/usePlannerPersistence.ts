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

const initialState: PlannerState = {
    data: getDefaultData(),
    history: [],
    metadata: {
        lastActionType: null,
        updatedAt: 0,
        isHydrated: false
    }
};

const getInitialOnlineState = () => (
    typeof navigator === 'undefined' ? true : navigator.onLine
);

const usePlannerPersistence = (user: User | null) => {
    const [state, dispatch] = useReducer(plannerReducer, initialState);
    const [isOnline, setIsOnline] = useState(getInitialOnlineState);
    const [hasPendingSync, setHasPendingSync] = useState(false);
    const currentUserRef = useRef<string>(user?.uid ?? 'guest');
    const isFirstLoad = useRef(true);

    const syncEventsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const localStorageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const userId = user?.uid ?? 'guest';

        if (currentUserRef.current !== userId || isFirstLoad.current) {
            logger.info('User switched or first load, resetting state', { from: currentUserRef.current, to: userId });
            currentUserRef.current = userId;
            isFirstLoad.current = false;

            dispatch({ type: 'RESET', initialState });

            const localState = loadFromLocalStorage(userId);
            setHasPendingSync(Boolean(user && localState.pendingSync));
            dispatch({
                type: 'HYDRATE_LOCAL',
                payload: localState.data,
                timestamp: localState.updatedAt || 0
            });
        }
    }, [user?.uid]);

    useEffect(() => {
        if (!user) return;

        logger.info('Setting up Firestore listeners for', user.uid);

        const initRemoteData = async () => {
            try {
                const [remoteEvents, remoteSettings] = await Promise.all([
                    loadEvents(user.uid),
                    loadSettings(user.uid)
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

        const unsubEvents = subscribeToEvents(user.uid, (remotePayload) => {
            dispatch({
                type: 'REMOTE_UPDATE',
                payload: { events: remotePayload.events },
                timestamp: getTimestampInMillis(remotePayload.updatedAt)
            });
        });

        const unsubSettings = subscribeToSettings(user.uid, (remoteSettings) => {
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
    }, [user?.uid]);

    const performRemoteSync = useCallback(async () => {
        if (!user || !state.metadata.isHydrated) return false;

        logger.info('Syncing local planner state to Firestore');
        const [eventsSynced, settingsSynced] = await Promise.all([
            syncEvents(user.uid, state.data.events, serverTimestamp()),
            syncSettings(user.uid, state.data.settings, serverTimestamp())
        ]);

        const didSync = eventsSynced !== false && settingsSynced !== false;

        if (didSync) {
            setHasPendingSync(false);
            return true;
        }

        setHasPendingSync(true);
        return false;
    }, [state.data.events, state.data.settings, state.metadata.isHydrated, user]);

    useEffect(() => {
        const { lastActionType, isHydrated, updatedAt } = state.metadata;
        const needsRemoteSync = Boolean(user && (lastActionType === 'USER_CHANGE' || lastActionType === 'UNDO'));

        // Don't save if not hydrated yet
        if (!isHydrated) return;

        const userId = user?.uid ?? 'guest';

        if (needsRemoteSync && !hasPendingSync) {
            setHasPendingSync(true);
        }

        if (localStorageTimeoutRef.current) clearTimeout(localStorageTimeoutRef.current);
        localStorageTimeoutRef.current = setTimeout(() => {
            logger.info('Saving state to LocalStorage for user:', userId);
            saveToLocalStorage(userId, state.data, updatedAt, needsRemoteSync || hasPendingSync);
        }, 50);

        if (user && needsRemoteSync && isOnline) {
            if (syncEventsTimeoutRef.current) clearTimeout(syncEventsTimeoutRef.current);
            syncEventsTimeoutRef.current = setTimeout(() => {
                void performRemoteSync();
            }, 300);
        }


        return () => {
            if (syncEventsTimeoutRef.current) clearTimeout(syncEventsTimeoutRef.current);
            if (localStorageTimeoutRef.current) clearTimeout(localStorageTimeoutRef.current);
        };
    }, [
        state.data,
        user?.uid,
        state.metadata.lastActionType,
        state.metadata.isHydrated,
        state.metadata.updatedAt,
        hasPendingSync,
        isOnline,
        performRemoteSync,
        user
    ]);

    useEffect(() => {
        if (state.metadata.lastActionType === 'REMOTE_UPDATE' && hasPendingSync) {
            setHasPendingSync(false);
        }
    }, [hasPendingSync, state.metadata.lastActionType]);

    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);

            if (user && state.metadata.isHydrated && hasPendingSync) {
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
    }, [hasPendingSync, performRemoteSync, state.metadata.isHydrated, user]);

    useEffect(() => {
        if (!user || !state.metadata.isHydrated || !hasPendingSync || !isOnline) {
            return;
        }

        if (state.metadata.lastActionType === 'USER_CHANGE' || state.metadata.lastActionType === 'UNDO') {
            return;
        }

        logger.info('Found pending local changes after hydration. Syncing to Firestore...');
        void performRemoteSync();
    }, [
        hasPendingSync,
        isOnline,
        performRemoteSync,
        state.metadata.isHydrated,
        state.metadata.lastActionType,
        user
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
        isInitialLoadDone: state.metadata.isHydrated,
        syncStatus: !user ? 'local-only' : !isOnline ? 'offline' : hasPendingSync ? 'pending' : 'synced'
    };
};

export default usePlannerPersistence;
