import React, { createContext, useContext, ReactNode, useMemo } from 'react';
import { PlannerEvent, getDatesInRange, getDateKey } from '../utils/calendarUtils';

interface PlannerEventsContextValue {
    events: PlannerEvent[];
    setEvents: (events: PlannerEvent[] | ((prev: PlannerEvent[]) => PlannerEvent[])) => void;

    // Derived state
    eventMap: Map<string, PlannerEvent[]>;

    // History / Undo
    canUndo: boolean;
    undo: () => void;
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
        monthsToShow: number;
    };
    children: ReactNode;
}

export const PlannerEventsProvider: React.FC<PlannerEventsProviderProps> = ({ value, children }) => {
    // Calculate eventMap here to avoid passing it from the top
    // It needs year and monthsToShow to filter effectively, which is why we pass them in props, 
    // even though they come from Meta context usually.
    const eventMap = useMemo(() => {
        const map = new Map<string, PlannerEvent[]>();
        const { events, year, monthsToShow } = value;

        for (const event of events) {
            const dates = getDatesInRange(event.start, event.end);

            for (const date of dates) {
                if (date.year !== year) continue;
                if (date.month >= monthsToShow) continue;

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
    }, [value.events, value.year, value.monthsToShow]);

    const memoizedValue = useMemo(() => ({
        events: value.events,
        setEvents: value.setEvents,
        canUndo: value.canUndo,
        undo: value.undo,
        eventMap
    }), [value.events, value.setEvents, value.canUndo, value.undo, eventMap]);

    return (
        <PlannerEventsContext.Provider value={memoizedValue}>
            {children}
        </PlannerEventsContext.Provider>
    );
};
