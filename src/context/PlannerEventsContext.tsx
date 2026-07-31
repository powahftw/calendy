import React, { createContext, useContext, ReactNode, useMemo } from 'react';
import { CalendarEvent, DayEvents, buildDayEventMap } from '../utils/calendarEvents';
import type { CalendarConnection } from '../hooks/useCalendarConnection';

interface PlannerEventsContextValue {
    events: CalendarEvent[];
    /** Day key -> the day's events, split into full-day chips and pill events. */
    eventMap: Map<string, DayEvents>;
    loading: boolean;
    refreshing: boolean;
    error: string | null;
    lastFetchedAt: number | null;
    refresh: () => Promise<void>;
    connection: CalendarConnection;
}

const PlannerEventsContext = createContext<PlannerEventsContextValue | undefined>(undefined);

export const usePlannerEvents = () => {
    const context = useContext(PlannerEventsContext);
    if (!context) {
        throw new Error('usePlannerEvents must be used within a PlannerEventsProvider');
    }
    return context;
};

interface PlannerEventsProviderProps {
    value: Omit<PlannerEventsContextValue, 'eventMap'> & {
        year: number;
        startMonth: number;
        monthsToShow: number;
        pillForAllTimedEvents: boolean;
    };
    children: ReactNode;
}

export const PlannerEventsProvider: React.FC<PlannerEventsProviderProps> = ({ value, children }) => {
    const {
        events,
        loading,
        refreshing,
        error,
        lastFetchedAt,
        refresh,
        connection,
        year,
        startMonth,
        monthsToShow,
        pillForAllTimedEvents
    } = value;

    const eventMap = useMemo(
        () => buildDayEventMap(events, { year, startMonth, monthsToShow }, pillForAllTimedEvents),
        [events, year, startMonth, monthsToShow, pillForAllTimedEvents]
    );

    const memoizedValue = useMemo(() => ({
        events,
        eventMap,
        loading,
        refreshing,
        error,
        lastFetchedAt,
        refresh,
        connection
    }), [connection, error, eventMap, events, lastFetchedAt, loading, refresh, refreshing]);

    return (
        <PlannerEventsContext.Provider value={memoizedValue}>
            {children}
        </PlannerEventsContext.Provider>
    );
};
