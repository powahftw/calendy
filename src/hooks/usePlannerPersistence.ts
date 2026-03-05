import { useEffect, useRef, useCallback, useReducer } from 'react';
import { User } from 'firebase/auth';
import { serverTimestamp, Timestamp } from 'firebase/firestore';
import { PlannerEvent, PlannerSettings, ThemeId } from '../utils/calendarUtils';
import {
    plannerReducer,
    PlannerState,
    PlannerData
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

const usePlannerPersistence = (user: User | null) => {
    const [state, dispatch] = useReducer(plannerReducer, initialState);
    const currentUserRef = useRef<string>(user?.uid ?? 'guest');
    const isFirstLoad = useRef(true);

    const syncEventsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const syncSettingsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const localStorageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // === PHASE 1: HYDRATION (runs once per user) ===
    useEffect(() => {
        const userId = user?.uid ?? 'guest';

        // User switched or first load
        if (currentUserRef.current !== userId || isFirstLoad.current) {
            logger.info('User switched or first load, resetting state', { from: currentUserRef.current, to: userId });
            currentUserRef.current = userId;
            isFirstLoad.current = false;

            dispatch({ type: 'RESET', initialState });

            const localState = loadFromLocalStorage(userId);
            dispatch({
                type: 'HYDRATE_LOCAL',
                payload: localState.data,
                timestamp: localState.updatedAt || 0
            });
        }
    }, [user?.uid]);

    // === PHASE 2: FIRESTORE LISTENER (only for logged-in users) ===
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

    // === PHASE 3: PERSISTENCE (saves when needed) ===
    useEffect(() => {
        const { lastActionType, isHydrated, updatedAt } = state.metadata;

        // Don't save if not hydrated yet
        if (!isHydrated) return;

        const userId = user?.uid ?? 'guest';

        // Debounce LocalStorage writes (50ms) to prevent blocking during rapid changes like dragging
        if (localStorageTimeoutRef.current) clearTimeout(localStorageTimeoutRef.current);
        localStorageTimeoutRef.current = setTimeout(() => {
            logger.info('Saving state to LocalStorage for user:', userId);
            saveToLocalStorage(userId, state.data, updatedAt);
        }, 50);

        // Save to Firestore ONLY on user changes and if logged in
        if (user && (lastActionType === 'USER_CHANGE' || lastActionType === 'UNDO')) {
            // Debounce Events Sync (300ms)
            if (syncEventsTimeoutRef.current) clearTimeout(syncEventsTimeoutRef.current);
            syncEventsTimeoutRef.current = setTimeout(() => {
                syncEvents(user.uid, state.data.events, serverTimestamp());
            }, 300);

            // Debounce Settings Sync (300ms)
            if (syncSettingsTimeoutRef.current) clearTimeout(syncSettingsTimeoutRef.current);
            syncSettingsTimeoutRef.current = setTimeout(() => {
                syncSettings(user.uid, state.data.settings, serverTimestamp());
            }, 300);
        }


        return () => {
            if (syncEventsTimeoutRef.current) clearTimeout(syncEventsTimeoutRef.current);
            if (syncSettingsTimeoutRef.current) clearTimeout(syncSettingsTimeoutRef.current);
            if (localStorageTimeoutRef.current) clearTimeout(localStorageTimeoutRef.current);
        };
    }, [state.data, user?.uid, state.metadata.lastActionType, state.metadata.isHydrated, state.metadata.updatedAt]);

    // === PHASE 4: OFFLINE SUPPORT ===
    useEffect(() => {
        const handleOnline = () => {
            if (user && state.metadata.isHydrated) {
                logger.info('Back online! Syncing state to Firestore...');
                syncEvents(user.uid, state.data.events, serverTimestamp());
                syncSettings(user.uid, state.data.settings, serverTimestamp());
            }
        };

        window.addEventListener('online', handleOnline);
        return () => window.removeEventListener('online', handleOnline);
    }, [user, state.data, state.metadata.isHydrated]);

    // === PUBLIC API (Setters) ===

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
        // Data
        events: state.data.events,
        ...state.data.settings,
        canUndo: state.history.length > 0,

        // Setters
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

        // Metadata
        isInitialLoadDone: state.metadata.isHydrated
    };
};

export default usePlannerPersistence;
