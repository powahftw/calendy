import React, { useState, useMemo } from 'react';
import { User } from 'firebase/auth';
import usePlannerPersistence from '../hooks/usePlannerPersistence';
import { useCalendarConnection } from '../hooks/useCalendarConnection';
import { useCalendarEvents } from '../hooks/useCalendarEvents';
import { buildDayEventMap } from '../utils/calendarEvents';
import { PlannerProvider, PlannerInteractionProvider, type PlannerContextValue } from './PlannerContext';

export const AppProvider: React.FC<{ user: User; children: React.ReactNode }> = ({ user, children }) => {
    const { settings, updateSettings, setTheme, navigate, syncStatus } = usePlannerPersistence(user);
    const connection = useCalendarConnection(user);
    const { events, loading, refreshing, error, lastFetchedAt, refresh } = useCalendarEvents({
        calendarId: connection.selection?.calendarId ?? null,
        year: settings.year,
        startMonth: settings.startMonth,
        monthsToShow: settings.monthsToShow,
        ensureAccess: connection.ensureAccess
    });
    const [openPillDayKey, setOpenPillDayKey] = useState<string | null>(null);

    const eventMap = useMemo(
        () => buildDayEventMap(events, settings, settings.pillUnmarkedEvents),
        [events, settings]
    );

    const plannerValue = useMemo<PlannerContextValue>(() => ({
        ...settings,
        updateSettings,
        setTheme,
        navigate,
        syncStatus,
        events,
        eventMap,
        loading,
        refreshing,
        error,
        lastFetchedAt,
        refresh,
        connection
    }), [
        settings, updateSettings, setTheme, navigate, syncStatus,
        events, eventMap, loading, refreshing, error, lastFetchedAt, refresh, connection
    ]);

    const interactionValue = useMemo(
        () => ({ openPillDayKey, setOpenPillDayKey }),
        [openPillDayKey]
    );

    return (
        <PlannerProvider value={plannerValue}>
            <PlannerInteractionProvider value={interactionValue}>
                {children}
            </PlannerInteractionProvider>
        </PlannerProvider>
    );
};
