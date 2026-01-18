import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { RangeDate, EventRange } from '../utils/calendarUtils';

interface PlannerInteractionContextValue {
    isDragging: boolean;
    dragStart: RangeDate | null;
    dragCurrent: RangeDate | null;
    selectionMode: boolean;
    activeEventId: string | null;
    startDrag: (m: number, d: number) => void;
    updateDrag: (m: number, d: number) => void;
    endDrag: (callback: (range: EventRange) => void) => void;
    isHighlighted: (m: number, d: number) => boolean;
    onTouchStart: (e: React.TouchEvent, m: number, d: number) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: (callback: (range: EventRange) => void) => void;
    onContextMenu: (e: React.MouseEvent) => void;
    setActiveEventId: (id: string | null) => void;
}

const PlannerInteractionContext = createContext<PlannerInteractionContextValue | undefined>(undefined);

export const usePlannerInteraction = () => {
    const context = useContext(PlannerInteractionContext);
    if (!context) {
        throw new Error('usePlannerInteraction must be used within a PlannerInteractionProvider');
    }
    return context;
};

interface PlannerInteractionProviderProps {
    value: PlannerInteractionContextValue;
    children: ReactNode;
}

export const PlannerInteractionProvider: React.FC<PlannerInteractionProviderProps> = ({ value, children }) => {
    return (
        <PlannerInteractionContext.Provider value={value}>
            {children}
        </PlannerInteractionContext.Provider>
    );
};
