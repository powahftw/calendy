import React, { createContext, useContext, ReactNode } from 'react';
import { ThemeId } from '../utils/calendarUtils';

export type SyncStatus = 'local-only' | 'synced' | 'pending' | 'offline';

export interface PlannerMetaContextValue {
    year: number;
    setYear: (year: number) => void;
    startMonth: number;
    setStartMonth: (m: number) => void;
    monthsToShow: number;
    setMonthsToShow: (n: number) => void;
    navigate: (direction: 1 | -1) => void;
    theme: ThemeId;
    setTheme: (theme: ThemeId) => void;
    highlightToday: boolean;
    setHighlightToday: (h: boolean) => void;
    showWeekends: boolean;
    setShowWeekends: (s: boolean) => void;
    showDayProgress: boolean;
    setShowDayProgress: (s: boolean) => void;
    weekdayAlign: boolean;
    setWeekdayAlign: (s: boolean) => void;
    isInitialLoadDone: boolean;
    syncStatus: SyncStatus;
}

const PlannerMetaContext = createContext<PlannerMetaContextValue | undefined>(undefined);

export const usePlannerMeta = () => {
    const context = useContext(PlannerMetaContext);
    if (!context) {
        throw new Error('usePlannerMeta must be used within a PlannerMetaProvider');
    }
    return context;
};

interface PlannerMetaProviderProps {
    value: PlannerMetaContextValue;
    children: ReactNode;
}

export const PlannerMetaProvider: React.FC<PlannerMetaProviderProps> = ({ value, children }) => {
    return (
        <PlannerMetaContext.Provider value={value}>
            {children}
        </PlannerMetaContext.Provider>
    );
};
