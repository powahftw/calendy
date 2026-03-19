import React, { createContext, useContext, ReactNode } from 'react';

interface PlannerDisplayContextValue {
    highlightToday: boolean;
    setHighlightToday: (h: boolean) => void;
    showWeekends: boolean;
    setShowWeekends: (s: boolean) => void;
    showDayProgress: boolean;
    setShowDayProgress: (s: boolean) => void;
    weekdayAlign: boolean;
    setWeekdayAlign: (s: boolean) => void;
}

const PlannerDisplayContext = createContext<PlannerDisplayContextValue | undefined>(undefined);

export const usePlannerDisplay = () => {
    const context = useContext(PlannerDisplayContext);
    if (!context) {
        throw new Error('usePlannerDisplay must be used within a PlannerDisplayProvider');
    }
    return context;
};

interface PlannerDisplayProviderProps {
    value: PlannerDisplayContextValue;
    children: ReactNode;
}

export const PlannerDisplayProvider: React.FC<PlannerDisplayProviderProps> = ({ value, children }) => {
    return (
        <PlannerDisplayContext.Provider value={value}>
            {children}
        </PlannerDisplayContext.Provider>
    );
};
