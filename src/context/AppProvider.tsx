import React, { useState, useMemo } from 'react';
import { User } from 'firebase/auth';
import usePlannerPersistence from '../hooks/usePlannerPersistence';
import { useCalendarConnection } from '../hooks/useCalendarConnection';
import { useCalendarEvents } from '../hooks/useCalendarEvents';
import { PlannerMetaProvider, type PlannerMetaContextValue } from './PlannerMetaContext';
import { PlannerEventsProvider } from './PlannerEventsContext';
import { PlannerInteractionProvider } from './PlannerInteractionContext';

export interface AppProviderProps {
    user: User;
    children: React.ReactNode;
}

export const AppProvider: React.FC<AppProviderProps> = ({ user, children }) => {
    const persistence = usePlannerPersistence(user);
    const connection = useCalendarConnection(user);
    const calendarEvents = useCalendarEvents({
        calendarId: connection.selection?.calendarId ?? null,
        year: persistence.year,
        startMonth: persistence.startMonth,
        monthsToShow: persistence.monthsToShow,
        ensureAccess: connection.ensureAccess
    });
    const [openPillDayKey, setOpenPillDayKey] = useState<string | null>(null);

    const metaValue = useMemo<PlannerMetaContextValue>(() => ({
        year: persistence.year,
        setYear: persistence.setYear,
        startMonth: persistence.startMonth,
        setStartMonth: persistence.setStartMonth,
        monthsToShow: persistence.monthsToShow,
        setMonthsToShow: persistence.setMonthsToShow,
        navigate: persistence.navigate,

        theme: persistence.theme,
        setTheme: persistence.setTheme,

        highlightToday: persistence.highlightToday,
        setHighlightToday: persistence.setHighlightToday,
        showWeekends: persistence.showWeekends,
        setShowWeekends: persistence.setShowWeekends,
        showDayProgress: persistence.showDayProgress,
        setShowDayProgress: persistence.setShowDayProgress,
        weekdayAlign: persistence.weekdayAlign,
        setWeekdayAlign: persistence.setWeekdayAlign,
        pillForAllTimedEvents: persistence.pillForAllTimedEvents,
        setPillForAllTimedEvents: persistence.setPillForAllTimedEvents,

        isInitialLoadDone: persistence.isInitialLoadDone,
        syncStatus: persistence.syncStatus as PlannerMetaContextValue['syncStatus'],
    }), [
        persistence.year,
        persistence.startMonth,
        persistence.monthsToShow,
        persistence.theme,
        persistence.highlightToday,
        persistence.showWeekends,
        persistence.showDayProgress,
        persistence.weekdayAlign,
        persistence.pillForAllTimedEvents,
        persistence.isInitialLoadDone,
        persistence.syncStatus,
        persistence.setYear,
        persistence.setStartMonth,
        persistence.setMonthsToShow,
        persistence.navigate,
        persistence.setTheme,
        persistence.setHighlightToday,
        persistence.setShowWeekends,
        persistence.setShowDayProgress,
        persistence.setWeekdayAlign,
        persistence.setPillForAllTimedEvents,
    ]);

    const eventsValue = useMemo(() => ({
        events: calendarEvents.events,
        loading: calendarEvents.loading,
        refreshing: calendarEvents.refreshing,
        error: calendarEvents.error,
        lastFetchedAt: calendarEvents.lastFetchedAt,
        refresh: calendarEvents.refresh,
        connection,
        year: persistence.year,
        startMonth: persistence.startMonth,
        monthsToShow: persistence.monthsToShow,
        pillForAllTimedEvents: persistence.pillForAllTimedEvents,
    }), [
        calendarEvents.events,
        calendarEvents.loading,
        calendarEvents.refreshing,
        calendarEvents.error,
        calendarEvents.lastFetchedAt,
        calendarEvents.refresh,
        connection,
        persistence.year,
        persistence.startMonth,
        persistence.monthsToShow,
        persistence.pillForAllTimedEvents,
    ]);

    const interactionValue = useMemo(() => ({
        openPillDayKey,
        setOpenPillDayKey,
    }), [openPillDayKey]);

    return (
        <PlannerMetaProvider value={metaValue}>
            <PlannerEventsProvider value={eventsValue}>
                <PlannerInteractionProvider value={interactionValue}>
                    {children}
                </PlannerInteractionProvider>
            </PlannerEventsProvider>
        </PlannerMetaProvider>
    );
};
