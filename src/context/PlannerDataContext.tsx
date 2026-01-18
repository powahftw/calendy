import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { PlannerEvent, ThemeId, isDateInRange, toLocalDate } from '../utils/calendarUtils';

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

        for (const event of events) {
            const startDate = toLocalDate(event.start);
            const endDate = toLocalDate(event.end);

            // Iterate day by day from start to end (inclusive)
            for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                // Check if this day is within our current view (rough check by year/month)
                // Note: d is mutable in the loop, we must be careful.

                const dYear = d.getFullYear();
                if (dYear !== year) continue;

                const dMonth = d.getMonth();
                if (dMonth >= monthsToShow) continue;

                const day = d.getDate();
                const dateKey = `${year}-${dMonth}-${day}`;

                if (!map[dateKey]) {
                    map[dateKey] = [];
                }
                map[dateKey].push(event);
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
