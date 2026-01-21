import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { PlannerEvent, ThemeId, getDatesInRange, getDateKey } from '../utils/calendarUtils';

interface PlannerDataContextValue {
    events: PlannerEvent[];
    setEvents: React.Dispatch<React.SetStateAction<PlannerEvent[]>>;
    year: number;
    setYear: (year: number) => void;
    monthsToShow: number;
    setMonthsToShow: (n: number) => void;
    theme: ThemeId;
    setTheme: (theme: ThemeId) => void;
    eventMap: Map<string, PlannerEvent[]>;
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
        ...value,
        eventMap
    }), [value, eventMap]);

    return (
        <PlannerDataContext.Provider value={memoizedValue}>
            {children}
        </PlannerDataContext.Provider>
    );
};
