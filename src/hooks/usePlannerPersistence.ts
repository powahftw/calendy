import { useState, useEffect, useRef } from 'react';
import { syncEvents, subscribeToEvents, loadEvents, syncSettings, subscribeToSettings, loadSettings } from '../firestoreSync';
import { defaultBluePalette, PlannerEvent, PlannerSettings } from '../utils/calendarUtils';
import { User } from 'firebase/auth';

const usePlannerPersistence = (user: User | null) => {
    const [year, setYear] = useState<number>(2026);
    const [monthsToShow, setMonthsToShow] = useState<number>(12);
    const [theme, setTheme] = useState<string>(() => localStorage.getItem('planner_theme') || 'blue');
    const [highlightToday, setHighlightToday] = useState<boolean>(() => {
        const saved = localStorage.getItem('planner_highlight_today');
        return saved !== null ? JSON.parse(saved) : true;
    });
    const [showWeekends, setShowWeekends] = useState<boolean>(() => {
        const saved = localStorage.getItem('planner_show_weekends');
        return saved !== null ? JSON.parse(saved) : true;
    });

    const [events, setEvents] = useState<PlannerEvent[]>(() => {
        const saved = localStorage.getItem('planner_events');
        const loadedEvents: any[] = saved ? JSON.parse(saved) : [];

        // Migration: Convert Hex colors to Indices
        const migrated = loadedEvents.map(ev => {
            if (typeof ev.color === 'string') {
                const idx = defaultBluePalette.indexOf(ev.color);
                return { ...ev, color: idx >= 0 ? idx : 0 };
            }
            return ev;
        });
        return migrated;
    });

    const [isInitialLoadDone, setIsInitialLoadDone] = useState(false);
    const isRemoteUpdate = useRef(false);

    // Persistence - Local Storage (fallback)
    useEffect(() => {
        if (!user) {
            localStorage.setItem('planner_events', JSON.stringify(events));
            localStorage.setItem('planner_theme', theme);
            localStorage.setItem('planner_highlight_today', JSON.stringify(highlightToday));
            localStorage.setItem('planner_show_weekends', JSON.stringify(showWeekends));
        }
    }, [events, theme, highlightToday, showWeekends, user]);

    // Sync to Firestore
    useEffect(() => {
        if (user && isInitialLoadDone && !isRemoteUpdate.current) {
            syncEvents(user.uid, events);
        }
    }, [events, user, isInitialLoadDone]);

    useEffect(() => {
        if (user && isInitialLoadDone && !isRemoteUpdate.current) {
            syncSettings(user.uid, { theme, highlightToday, showWeekends, year, monthsToShow });
        }
    }, [theme, highlightToday, showWeekends, year, monthsToShow, user, isInitialLoadDone]);

    // Handle resetting the remote update flag
    useEffect(() => {
        if (isRemoteUpdate.current) {
            const timer = setTimeout(() => {
                isRemoteUpdate.current = false;
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [events, theme, highlightToday, showWeekends, year, monthsToShow]);

    // Subscribe to Firestore changes
    useEffect(() => {
        if (!user) return;

        const initData = async () => {
            try {
                const [firestoreEvents, firestoreSettings] = await Promise.all([
                    loadEvents(user.uid),
                    loadSettings(user.uid)
                ]);

                if (firestoreEvents !== null) {
                    isRemoteUpdate.current = true;
                    setEvents(firestoreEvents);
                }

                if (firestoreSettings) {
                    isRemoteUpdate.current = true;
                    if (firestoreSettings.theme) setTheme(firestoreSettings.theme);
                    if (firestoreSettings.highlightToday !== undefined) setHighlightToday(firestoreSettings.highlightToday);
                    if (firestoreSettings.showWeekends !== undefined) setShowWeekends(firestoreSettings.showWeekends);
                    if (firestoreSettings.year) setYear(firestoreSettings.year);
                    if (firestoreSettings.monthsToShow) setMonthsToShow(firestoreSettings.monthsToShow);
                }
            } catch (err) {
                console.error("Initialization error:", err);
            } finally {
                setIsInitialLoadDone(true);
            }
        };

        initData();

        const unsubEvents = subscribeToEvents(user.uid, (remoteEvents) => {
            setEvents(prev => {
                if (JSON.stringify(prev) === JSON.stringify(remoteEvents)) return prev;
                isRemoteUpdate.current = true;
                return remoteEvents;
            });
        });

        const unsubSettings = subscribeToSettings(user.uid, (remoteSettings) => {
            const settingsChanged = (
                (remoteSettings.theme && remoteSettings.theme !== theme) ||
                (remoteSettings.highlightToday !== undefined && remoteSettings.highlightToday !== highlightToday) ||
                (remoteSettings.showWeekends !== undefined && remoteSettings.showWeekends !== showWeekends) ||
                (remoteSettings.year !== undefined && remoteSettings.year !== year) ||
                (remoteSettings.monthsToShow !== undefined && remoteSettings.monthsToShow !== monthsToShow)
            );

            if (settingsChanged) {
                isRemoteUpdate.current = true;
                if (remoteSettings.theme) setTheme(remoteSettings.theme);
                if (remoteSettings.highlightToday !== undefined) setHighlightToday(remoteSettings.highlightToday);
                if (remoteSettings.showWeekends !== undefined) setShowWeekends(remoteSettings.showWeekends);
                if (remoteSettings.year) setYear(remoteSettings.year);
                if (remoteSettings.monthsToShow) setMonthsToShow(remoteSettings.monthsToShow);
            }
        });

        return () => {
            unsubEvents();
            unsubSettings();
        };
    }, [user, theme, highlightToday, showWeekends, year, monthsToShow]);

    return {
        year, setYear,
        monthsToShow, setMonthsToShow,
        theme, setTheme,
        highlightToday, setHighlightToday,
        showWeekends, setShowWeekends,
        events, setEvents,
        isInitialLoadDone
    };
};

export default usePlannerPersistence;
