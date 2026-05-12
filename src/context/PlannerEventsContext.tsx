import React, { createContext, useContext, ReactNode, useMemo } from 'react';
import { PlannerEvent, getDatesInRange, getDateKey } from '../utils/calendarUtils';
import type { GoogleCalendarSyncControls } from '../hooks/useGoogleCalendarSync';

interface PlannerEventsContextValue {
    events: PlannerEvent[];
    setEvents: (events: PlannerEvent[] | ((prev: PlannerEvent[]) => PlannerEvent[])) => void;
    eventMap: Map<string, PlannerEvent[]>;
    canUndo: boolean;
    undo: () => void;
    googleSync: GoogleCalendarSyncControls;
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
    };
    children: ReactNode;
}

export const PlannerEventsProvider: React.FC<PlannerEventsProviderProps> = ({ value, children }) => {
    const {
        events,
        setEvents,
        canUndo,
        undo,
        year,
        startMonth,
        monthsToShow,
        googleSync
    } = value;

    const eventMap = useMemo(() => {
        const map = new Map<string, PlannerEvent[]>();

        const startMonthTotal = year * 12 + startMonth;
        const endMonthTotal = startMonthTotal + monthsToShow;

        for (const event of events) {
            const dates = getDatesInRange(event.start, event.end);

            for (const date of dates) {
                const dateMonthTotal = date.year * 12 + date.month;

                if (dateMonthTotal < startMonthTotal || dateMonthTotal >= endMonthTotal) continue;

                const dateKey = getDateKey(date.year, date.month, date.day);
                const existing = map.get(dateKey);
                if (existing) {
                    existing.push(event);
                } else {
                    map.set(dateKey, [event]);
                }
            }
        }
        return map;
    }, [events, year, startMonth, monthsToShow]);

    const memoizedValue = useMemo(() => ({
        events,
        setEvents,
        canUndo,
        undo,
        eventMap,
        googleSync
    }), [
        events,
        setEvents,
        canUndo,
        undo,
        eventMap,
        googleSync
    ]);

    return (
        <PlannerEventsContext.Provider value={memoizedValue}>
            {children}
        </PlannerEventsContext.Provider>
    );
};
