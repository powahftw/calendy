import React, { createContext, useContext, ReactNode } from 'react';
import { User } from 'firebase/auth';
import usePlannerPersistence from '../hooks/usePlannerPersistence';
import useDragSelection from '../hooks/useDragSelection';
import { PlannerEvent, EventRange, ThemeId } from '../utils/calendarUtils';

interface PlannerContextType {
    // Persistence
    year: number;
    setYear: (y: number) => void;
    monthsToShow: number;
    setMonthsToShow: (m: number) => void;
    theme: ThemeId;
    setTheme: (t: ThemeId) => void;
    highlightToday: boolean;
    setHighlightToday: (h: boolean) => void;
    showWeekends: boolean;
    setShowWeekends: (s: boolean) => void;
    showDayProgress: boolean;
    setShowDayProgress: (s: boolean) => void;
    events: PlannerEvent[];
    setEvents: (e: PlannerEvent[]) => void;
    isInitialLoadDone: boolean;

    // Drag Selection
    isDragging: boolean;
    selectionMode: boolean;
    startDrag: (m: number, d: number) => void;
    updateDrag: (m: number, d: number) => void;
    endDrag: (callback: (range: EventRange) => void) => void;
    isHighlighted: (m: number, d: number) => boolean;
    onTouchStart: (e: React.TouchEvent, m: number, d: number) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: (callback: (range: EventRange) => void) => void;
    onContextMenu: (e: React.MouseEvent) => void;
}

const PlannerContext = createContext<PlannerContextType | undefined>(undefined);

export const usePlanner = () => {
    const context = useContext(PlannerContext);
    if (!context) {
        throw new Error('usePlanner must be used within a PlannerProvider');
    }
    return context;
};

interface PlannerProviderProps {
    user: User | null;
    children: ReactNode;
}

export const PlannerProvider: React.FC<PlannerProviderProps> = ({ user, children }) => {
    const persistence = usePlannerPersistence(user);
    const dragSelection = useDragSelection(persistence.year);

    const value = {
        ...persistence,
        ...dragSelection
    };

    return (
        <PlannerContext.Provider value={value}>
            {children}
        </PlannerContext.Provider>
    );
};
