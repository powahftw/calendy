import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { syncEvents, subscribeToEvents, loadEvents, syncSettings, subscribeToSettings, loadSettings } from '../firestoreSync';
import { PlannerEvent, PlannerSettings, ThemeId } from '../utils/calendarUtils';
import { User } from 'firebase/auth';

const getStorageKey = (user: User | null, key: string) => {
    // If user is null, we assume Guest Mode (or just local user).
    // Using 'guest' suffix ensures we don't accidentally wipe a logged-out user's data if they logged out.
    const suffix = user ? `_${user.uid}` : '_guest';
    return `planner_${key}${suffix}`;
};

const SETTINGS_STORAGE_KEYS = {
    theme: 'theme',
    highlightToday: 'highlight_today',
    showWeekends: 'show_weekends',
    showDayProgress: 'show_day_progress',
    weekdayAlign: 'weekday_align',
    year: 'year',
    monthsToShow: 'months_to_show'
} as const;

const usePlannerPersistence = (user: User | null) => {
    // We use a ref to track which user "owns" the current state.
    // This prevents writing User A's data to User B's storage during a fast switch.
    const currentUserIdRef = useRef<string>(user ? user.uid : 'guest');

    // -- State Definitions --
    const [year, setYear] = useState<number>(2026);
    const [monthsToShow, setMonthsToShow] = useState<number>(12);
    const [theme, setTheme] = useState<ThemeId>('blue');
    const [highlightToday, setHighlightToday] = useState<boolean>(true);
    const [showWeekends, setShowWeekends] = useState<boolean>(true);
    const [showDayProgress, setShowDayProgress] = useState<boolean>(true);
    const [weekdayAlign, setWeekdayAlign] = useState<boolean>(true);
    const [events, setEvents] = useState<PlannerEvent[]>([]);

    const [isInitialLoadDone, setIsInitialLoadDone] = useState(false);
    const [shouldSyncUpstream, setShouldSyncUpstream] = useState(false); // Safety guard
    const isRemoteUpdate = useRef(false);
    const isLocalLoad = useRef(false);
    const localEventsUpdatedAtRef = useRef<number | null>(null);

    const settingsPayload = useMemo<PlannerSettings>(() => ({
        theme,
        highlightToday,
        showWeekends,
        showDayProgress,
        weekdayAlign,
        year,
        monthsToShow
    }), [theme, highlightToday, showWeekends, showDayProgress, weekdayAlign, year, monthsToShow]);

    const settingsRef = useRef(settingsPayload);

    useEffect(() => {
        settingsRef.current = settingsPayload;
    }, [settingsPayload]);

    const applyRemoteSettings = useCallback((remoteSettings: Partial<PlannerSettings>) => {
        let changed = false;
        const updateSetting = <K extends keyof PlannerSettings>(key: K, setter: (value: PlannerSettings[K]) => void) => {
            const remoteValue = remoteSettings[key];
            if (remoteValue !== undefined && remoteValue !== settingsRef.current[key]) {
                setter(remoteValue as PlannerSettings[K]);
                changed = true;
            }
        };

        updateSetting('theme', setTheme);
        updateSetting('highlightToday', setHighlightToday);
        updateSetting('showWeekends', setShowWeekends);
        updateSetting('showDayProgress', setShowDayProgress);
        updateSetting('weekdayAlign', setWeekdayAlign);
        updateSetting('year', setYear);
        updateSetting('monthsToShow', setMonthsToShow);

        return changed;
    }, [setTheme, setHighlightToday, setShowWeekends, setShowDayProgress, setWeekdayAlign, setYear, setMonthsToShow]);

    // Initialize/Load Data helper
    const loadFromLocalStorage = useCallback((currentUser: User | null) => {
        const getVal = <T,>(key: string, defaultVal: T): T => {
            const storKey = getStorageKey(currentUser, key);
            const saved = localStorage.getItem(storKey);

            if (saved !== null) {
                try {
                    return JSON.parse(saved) as T;
                } catch (error) {
                    console.error(`Failed to parse setting from localStorage for key ${storKey}:`, error);
                }
            }

            return defaultVal;
        };

        const getEvents = (): { events: PlannerEvent[]; found: boolean; updatedAt: number | null } => {
            const storKey = getStorageKey(currentUser, 'events');
            const saved = localStorage.getItem(storKey);

            let rawEvents: PlannerEvent[] = [];
            let found = false;
            let updatedAt: number | null = null;

            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    if (Array.isArray(parsed)) {
                        rawEvents = parsed;
                        found = true;
                    } else if (parsed && typeof parsed === 'object') {
                        rawEvents = Array.isArray(parsed.items) ? parsed.items : [];
                        updatedAt = typeof parsed.updatedAt === 'number' ? parsed.updatedAt : null;
                        found = true;
                    }
                } catch (error) {
                    console.error(`Failed to parse events from localStorage for key ${storKey}:`, error);
                }
            }

            return { events: rawEvents, found, updatedAt };
        };

        setYear(getVal<number>('year', 2026));
        setMonthsToShow(getVal<number>('months_to_show', 12));
        setTheme(getVal<ThemeId>('theme', 'blue'));
        setHighlightToday(getVal<boolean>('highlight_today', true));
        setShowWeekends(getVal<boolean>('show_weekends', true));
        setShowDayProgress(getVal<boolean>('show_day_progress', true));
        setWeekdayAlign(getVal<boolean>('weekday_align', true));

        const { events: loadedEvents, found: foundLocalEvents, updatedAt } = getEvents();

        setEvents(loadedEvents);
        localEventsUpdatedAtRef.current = updatedAt;
        isLocalLoad.current = true;

        // Update the ref to match what we just loaded
        currentUserIdRef.current = currentUser ? currentUser.uid : 'guest';

        // If we found local events, we are ready to sync. 
        // If NOT, we should wait for Remote Init before allowing upstream sync.
        setIsInitialLoadDone(true);
        if (foundLocalEvents || !currentUser) {
            setShouldSyncUpstream(true);
        }
    }, []);

    // 1. Load Local Data on Mount or User Change
    useEffect(() => {
        setIsInitialLoadDone(false);
        setShouldSyncUpstream(false);
        loadFromLocalStorage(user);
    }, [user, loadFromLocalStorage]);

    // 2. Persist to Local Storage (Immediate)
    useEffect(() => {
        const activeId = user ? user.uid : 'guest';
        if (currentUserIdRef.current !== activeId) {
            // State mismatch (e.g. during switch), do not save.
            return;
        }

        const save = (key: string, val: unknown) => localStorage.setItem(getStorageKey(user, key), JSON.stringify(val));

        const updatedAt = isRemoteUpdate.current || isLocalLoad.current
            ? localEventsUpdatedAtRef.current
            : Date.now();
        if (!isRemoteUpdate.current && !isLocalLoad.current) {
            localEventsUpdatedAtRef.current = updatedAt;
        }
        localStorage.setItem(
            getStorageKey(user, 'events'),
            JSON.stringify({ items: events, updatedAt })
        );
        (Object.keys(SETTINGS_STORAGE_KEYS) as Array<keyof PlannerSettings>).forEach((key) => {
            const storageKey = SETTINGS_STORAGE_KEYS[key];
            const value = settingsPayload[key];
            save(storageKey, value);
        });

    }, [events, settingsPayload, user]);

    // 3. Sync to Firestore (Upstream) - DEBOUNCED
    const syncEventsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const syncSettingsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        // Guard: Only sync if we are explicitly allowed to (prevents wiping remote with empty local init)
        if (user && isInitialLoadDone && shouldSyncUpstream && !isRemoteUpdate.current) {

            // Debounce Events Sync
            if (syncEventsTimeoutRef.current) clearTimeout(syncEventsTimeoutRef.current);
            syncEventsTimeoutRef.current = setTimeout(() => {
                syncEvents(user.uid, events);
            }, 300);

            // Debounce Settings Sync
            if (syncSettingsTimeoutRef.current) clearTimeout(syncSettingsTimeoutRef.current);
            syncSettingsTimeoutRef.current = setTimeout(() => {
                syncSettings(user.uid, settingsPayload);
            }, 300);
        }

        return () => {
            if (syncEventsTimeoutRef.current) clearTimeout(syncEventsTimeoutRef.current);
            if (syncSettingsTimeoutRef.current) clearTimeout(syncSettingsTimeoutRef.current);
        };
    }, [events, settingsPayload, user, isInitialLoadDone, shouldSyncUpstream]);

    // 4. Subscribe to Firestore (Downstream) & Initial Remote Load
    useEffect(() => {
        if (!user) return;

        // Reset remote update flag
        isRemoteUpdate.current = false;

        const initRemoteData = async () => {
            try {
                // Fetch remote data to see if we missed anything (source of truth)
                const [remoteEvents, remoteSettings] = await Promise.all([
                    loadEvents(user.uid),
                    loadSettings(user.uid)
                ]);

                // If remote exists, it wins (or merges). For now, it wins.
                if (remoteEvents) {
                    setEvents(prev => {
                        const localUpdatedAt = localEventsUpdatedAtRef.current ?? 0;
                        const remoteUpdatedAt = remoteEvents.updatedAt ?? 0;
                        const remoteHasData = remoteEvents.events.length > 0;
                        const localHasData = prev.length > 0;

                        const remoteWins =
                            remoteHasData &&
                            (remoteUpdatedAt >= localUpdatedAt || !localHasData);


                        if (remoteWins && JSON.stringify(prev) !== JSON.stringify(remoteEvents.events)) {
                            isRemoteUpdate.current = true;
                            localEventsUpdatedAtRef.current = remoteEvents.updatedAt ?? null;
                            return remoteEvents.events;
                        }
                        return prev;
                    });
                }

                // Settings...
                if (remoteSettings) {
                    if (applyRemoteSettings(remoteSettings)) {
                        isRemoteUpdate.current = true;
                    }
                }

                // NOW we can allow upstream syncs for future changes
                setShouldSyncUpstream(true);

            } catch (e) {
                console.error("Failed to init remote data", e);
                // Even on fail, we should probably allow syncing local data eventually? 
                // Maybe not, to be safe. User can retry interaction.
                setShouldSyncUpstream(true); // Allow local changes to push eventually
            }
        };

        initRemoteData();

        const unsubEvents = subscribeToEvents(user.uid, (remotePayload) => {
            setEvents(prev => {
                const prevStr = JSON.stringify(prev);
                const remoteStr = JSON.stringify(remotePayload.events);
                if (prevStr === remoteStr) return prev;

                const localUpdatedAt = localEventsUpdatedAtRef.current ?? 0;
                const remoteUpdatedAt = remotePayload.updatedAt ?? 0;
                const remoteHasData = remotePayload.events.length > 0;

                if (!remoteHasData && localUpdatedAt > remoteUpdatedAt) {
                    return prev;
                }

                isRemoteUpdate.current = true;
                localEventsUpdatedAtRef.current = remotePayload.updatedAt ?? null;
                return remotePayload.events;
            });
        });

        const unsubSettings = subscribeToSettings(user.uid, (remoteSettings) => {
            if (applyRemoteSettings(remoteSettings)) {
                isRemoteUpdate.current = true;
            }
        });

        return () => {
            unsubEvents();
            unsubSettings();
        };
    }, [applyRemoteSettings, user?.uid]); // Only re-subscribe if UID changes. 

    // 5. Reset Remote Update Flag
    useEffect(() => {
        if (isRemoteUpdate.current || isLocalLoad.current) {
            // Unblock upstream sync or local timestamp updates after a short delay
            const timer = setTimeout(() => {
                isRemoteUpdate.current = false;
                isLocalLoad.current = false;
            }, 100); // 100ms grace period
            return () => clearTimeout(timer);
        }
    }, [events, settingsPayload]);

    // 6. Offline Support (Sync on reconnect) - Optimized with useRef
    const stateRef = useRef({ events, settings: settingsPayload });

    useEffect(() => {
        stateRef.current = { events, settings: settingsPayload };
    }, [events, settingsPayload]);

    useEffect(() => {
        const handleOnline = () => {
            if (user && isInitialLoadDone) {
                console.log("Back online! Force syncing...");
                const { events, settings } = stateRef.current;
                syncEvents(user.uid, events);
                syncSettings(user.uid, settings);
            }
        };

        window.addEventListener('online', handleOnline);
        return () => window.removeEventListener('online', handleOnline);
    }, [user, isInitialLoadDone]);

    return {
        year, setYear,
        monthsToShow, setMonthsToShow,
        theme, setTheme,
        highlightToday, setHighlightToday,
        showWeekends, setShowWeekends,
        showDayProgress, setShowDayProgress,
        weekdayAlign, setWeekdayAlign,
        events, setEvents,
        isInitialLoadDone
    };
};

export default usePlannerPersistence;
