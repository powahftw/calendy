import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { PlannerEvent, ThemeId, isDateInRange } from '../utils/calendarUtils';

interface PlannerDataContextValue {
    events: PlannerEvent[];
    setEvents: React.Dispatch<React.SetStateAction<PlannerEvent[]>>;
    year: number;
    setYear: (year: number) => void;
    monthsToShow: number;
    setMonthsToShow: (n: number) => void;
    theme: ThemeId;
    setTheme: (theme: ThemeId) => void;
    eventMap: Record<string, PlannerEvent[]>;
    isInitialLoadDone: boolean;
}

const PlannerDataContext = createContext<PlannerDataContextValue | undefined>(undefined);

export const usePlannerData = () => {
    const context = useContext(PlannerDataContext);
    if (!context) {
        throw new Error('usePlannerData must be used within a PlannerDataProvider');
    }
    return context;
};

interface PlannerDataProviderProps {
    value: Omit<PlannerDataContextValue, 'eventMap'>;
    children: ReactNode;
}

export const PlannerDataProvider: React.FC<PlannerDataProviderProps> = ({ value, children }) => {
    const eventMap = useMemo(() => {
        const map: Record<string, PlannerEvent[]> = {};
        const { events, year, monthsToShow } = value;

        // We only need to map events for the visible months
        for (let m = 0; m < monthsToShow; m++) {
            const daysInMonth = new Date(year, m + 1, 0).getDate();
            for (let d = 1; d <= daysInMonth; d++) {
                const dateKey = `${year}-${m}-${d}`;
                const dayEvents = events.filter(ev => isDateInRange(year, m, d, ev.start, ev.end));
                if (dayEvents.length > 0) {
                    map[dateKey] = dayEvents;
                }
            }
        }
        return map;
    }, [value.events, value.year, value.monthsToShow]);

    const memoizedValue = useMemo(() => ({
        ...value,
        eventMap
    }), [value, eventMap]);

    return (
        <PlannerDataContext.Provider value={memoizedValue}>
            {children}
        </PlannerDataContext.Provider>
    );
};
