import { useState, useEffect, useRef, useCallback } from 'react';
import { syncEvents, subscribeToEvents, loadEvents, syncSettings, subscribeToSettings, loadSettings } from '../firestoreSync';
import { defaultBluePalette, PlannerEvent, PlannerSettings, ThemeId } from '../utils/calendarUtils';
import { User } from 'firebase/auth';

const getStorageKey = (user: User | null, key: string) => {
    // If user is null, we assume Guest Mode (or just local user).
    // Using 'guest' suffix ensures we don't accidentally wipe a logged-out user's data if they logged out.
    const suffix = user ? `_${user.uid}` : '_guest';
    return `planner_${key}${suffix}`;
};

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
    const localEventsUpdatedAtRef = useRef<number | null>(null);

    // Initialize/Load Data helper
    const loadFromLocalStorage = useCallback((currentUser: User | null) => {
        const getVal = (key: string, defaultVal: any) => {
            const storKey = getStorageKey(currentUser, key);
            const saved = localStorage.getItem(storKey);

            return saved !== null ? JSON.parse(saved) : defaultVal;
        };

        const getEvents = () => {
            const storKey = getStorageKey(currentUser, 'events');
            const saved = localStorage.getItem(storKey);

            let rawEvents: any[] = [];
            let found = false;
            let updatedAt: number | null = null;

            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) {
                    rawEvents = parsed;
                    found = true;
                } else if (parsed && typeof parsed === 'object') {
                    rawEvents = Array.isArray(parsed.items) ? parsed.items : [];
                    updatedAt = typeof parsed.updatedAt === 'number' ? parsed.updatedAt : null;
                    found = true;
                }
            }

            return { events: rawEvents, found, updatedAt };
        };

        setYear(getVal('year', 2026));
        setMonthsToShow(getVal('months_to_show', 12));
        setTheme((localStorage.getItem(getStorageKey(currentUser, 'theme')) as ThemeId) || 'blue');
        setHighlightToday(getVal('highlight_today', true));
        setShowWeekends(getVal('show_weekends', true));
        setShowDayProgress(getVal('show_day_progress', true));
        setWeekdayAlign(getVal('weekday_align', true));

        const { events: loadedEvents, found: foundLocalEvents, updatedAt } = getEvents();

        // Migration: Convert Hex colors to Indices (Legacy check)
        const migratedEvents = loadedEvents.map((ev: any) => {
            if (typeof ev.color === 'string') {
                const idx = defaultBluePalette.indexOf(ev.color);
                return { ...ev, color: idx >= 0 ? idx : 0 };
            }
            return ev;
        });

        setEvents(migratedEvents);
        localEventsUpdatedAtRef.current = updatedAt;

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

        const save = (key: string, val: any) => localStorage.setItem(getStorageKey(user, key), JSON.stringify(val));

        const updatedAt = isRemoteUpdate.current
            ? localEventsUpdatedAtRef.current ?? Date.now()
            : Date.now();
        if (!isRemoteUpdate.current) {
            localEventsUpdatedAtRef.current = updatedAt;
        }
        localStorage.setItem(
            getStorageKey(user, 'events'),
            JSON.stringify({ items: events, updatedAt })
        );
        localStorage.setItem(getStorageKey(user, 'theme'), theme); // String, no JSON
        save('highlight_today', highlightToday);
        save('show_weekends', showWeekends);
        save('show_day_progress', showDayProgress);
        save('weekday_align', weekdayAlign);
        save('year', year);
        save('months_to_show', monthsToShow);

    }, [events, theme, highlightToday, showWeekends, showDayProgress, weekdayAlign, year, monthsToShow, user]);

    // 3. Sync to Firestore (Upstream)
    useEffect(() => {
        // Guard: Only sync if we are explicitly allowed to (prevents wiping remote with empty local init)
        if (user && isInitialLoadDone && shouldSyncUpstream && !isRemoteUpdate.current) {
            syncEvents(user.uid, events);
            syncSettings(user.uid, { theme, highlightToday, showWeekends, showDayProgress, weekdayAlign, year, monthsToShow });
        }
    }, [events, theme, highlightToday, showWeekends, showDayProgress, weekdayAlign, year, monthsToShow, user, isInitialLoadDone, shouldSyncUpstream]);

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
                    // (Apply settings similarly...)
                    let changed = false;
                    const updateIfChanged = (current: any, remote: any, setter: (v: any) => void) => {
                        if (remote !== undefined && remote !== current) {
                            setter(remote);
                            changed = true;
                        }
                    };

                    updateIfChanged(theme, remoteSettings.theme, setTheme);
                    updateIfChanged(highlightToday, remoteSettings.highlightToday, setHighlightToday);
                    updateIfChanged(showWeekends, remoteSettings.showWeekends, setShowWeekends);
                    updateIfChanged(showDayProgress, remoteSettings.showDayProgress, setShowDayProgress);
                    updateIfChanged(weekdayAlign, remoteSettings.weekdayAlign, setWeekdayAlign);
                    updateIfChanged(year, remoteSettings.year, setYear);
                    updateIfChanged(monthsToShow, remoteSettings.monthsToShow, setMonthsToShow);

                    if (changed) {
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
            // Batch updates to avoid multiple renders/writes
            let changed = false;

            // Helper to update if changed
            const updateIfChanged = (current: any, remote: any, setter: (v: any) => void) => {
                if (remote !== undefined && remote !== current) {
                    setter(remote);
                    changed = true;
                }
            };

            updateIfChanged(theme, remoteSettings.theme, setTheme);
            updateIfChanged(highlightToday, remoteSettings.highlightToday, setHighlightToday);
            updateIfChanged(showWeekends, remoteSettings.showWeekends, setShowWeekends);
            updateIfChanged(showDayProgress, remoteSettings.showDayProgress, setShowDayProgress);
            updateIfChanged(weekdayAlign, remoteSettings.weekdayAlign, setWeekdayAlign);
            updateIfChanged(year, remoteSettings.year, setYear);
            updateIfChanged(monthsToShow, remoteSettings.monthsToShow, setMonthsToShow);

            if (changed) {
                isRemoteUpdate.current = true;
            }
        });

        return () => {
            unsubEvents();
            unsubSettings();
        };
    }, [user?.uid]); // Only re-subscribe if UID changes. 

    // 5. Reset Remote Update Flag
    useEffect(() => {
        if (isRemoteUpdate.current) {
            // Unblock upstream sync after a short delay
            const timer = setTimeout(() => {
                isRemoteUpdate.current = false;
            }, 100); // 100ms grace period
            return () => clearTimeout(timer);
        }
    }, [events, theme, highlightToday, showWeekends, showDayProgress, weekdayAlign, year, monthsToShow]);

    // 6. Offline Support (Sync on reconnect) - Optimized with useRef
    const stateRef = useRef({ events, theme, highlightToday, showWeekends, showDayProgress, weekdayAlign, year, monthsToShow });

    useEffect(() => {
        stateRef.current = { events, theme, highlightToday, showWeekends, showDayProgress, weekdayAlign, year, monthsToShow };
    }, [events, theme, highlightToday, showWeekends, showDayProgress, weekdayAlign, year, monthsToShow]);

    useEffect(() => {
        const handleOnline = () => {
            if (user && isInitialLoadDone) {
                console.log("Back online! Force syncing...");
                const { events, theme, highlightToday, showWeekends, showDayProgress, weekdayAlign, year, monthsToShow } = stateRef.current;
                syncEvents(user.uid, events);
                syncSettings(user.uid, { theme, highlightToday, showWeekends, showDayProgress, weekdayAlign, year, monthsToShow });
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
