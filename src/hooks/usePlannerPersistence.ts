import { useEffect, useRef, useCallback, useReducer } from 'react';
import { User } from 'firebase/auth';
import { PlannerEvent, PlannerSettings, ThemeId } from '../utils/calendarUtils';
import {
    plannerReducer,
    PlannerState,
    PlannerData
} from './usePlannerState';
import {
    loadFromLocalStorage,
    saveToLocalStorage,
    getDefaultData
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
                timestamp: localState.updatedAt
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
                        timestamp: remoteEvents.updatedAt || 0
                    });
                }

                if (remoteSettings) {
                    const { updatedAt, ...settings } = remoteSettings;
                    dispatch({
                        type: 'REMOTE_UPDATE',
                        payload: { settings },
                        timestamp: updatedAt || 0
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
                timestamp: remotePayload.updatedAt || 0
            });
        });

        const unsubSettings = subscribeToSettings(user.uid, (remoteSettings) => {
            const { updatedAt, ...settings } = remoteSettings;
            dispatch({
                type: 'REMOTE_UPDATE',
                payload: { settings },
                timestamp: updatedAt || 0
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
        if (user && lastActionType === 'USER_CHANGE') {
            // Debounce Events Sync (300ms)
            if (syncEventsTimeoutRef.current) clearTimeout(syncEventsTimeoutRef.current);
            syncEventsTimeoutRef.current = setTimeout(() => {
                syncEvents(user.uid, state.data.events, updatedAt);
            }, 300);

            // Debounce Settings Sync (300ms)
            if (syncSettingsTimeoutRef.current) clearTimeout(syncSettingsTimeoutRef.current);
            syncSettingsTimeoutRef.current = setTimeout(() => {
                syncSettings(user.uid, state.data.settings, updatedAt);
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
                syncEvents(user.uid, state.data.events, Date.now());
                syncSettings(user.uid, state.data.settings, Date.now());
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
    const setMonthsToShow = useCallback((monthsToShow: number) => updateSettings({ monthsToShow }), [updateSettings]);

    return {
        // Data
        events: state.data.events,
        ...state.data.settings,

        // Setters
        setEvents,
        setTheme,
        setHighlightToday,
        setShowWeekends,
        setShowDayProgress,
        setWeekdayAlign,
        setYear,
        setMonthsToShow,

        // Metadata
        isInitialLoadDone: state.metadata.isHydrated
    };
};

export default usePlannerPersistence;
