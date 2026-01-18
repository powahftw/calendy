import React, { createContext, useContext, ReactNode, useState, useMemo } from 'react';
import { User } from 'firebase/auth';
import usePlannerPersistence from '../hooks/usePlannerPersistence';
import useDragSelection from '../hooks/useDragSelection';
import { PlannerEvent, EventRange, ThemeId, RangeDate } from '../utils/calendarUtils';
import { PlannerDataProvider, usePlannerData } from './PlannerDataContext';
import { PlannerInteractionProvider, usePlannerInteraction } from './PlannerInteractionContext';
import { PlannerDisplayProvider, usePlannerDisplay } from './PlannerDisplayContext';

// Export everything for convenience
export * from './PlannerDataContext';
export * from './PlannerInteractionContext';
export * from './PlannerDisplayContext';

interface PlannerProviderProps {
    user: User | null;
    children: ReactNode;
}

export const PlannerProvider: React.FC<PlannerProviderProps> = ({ user, children }) => {
    const persistence = usePlannerPersistence(user);
    const dragSelection = useDragSelection(persistence.year);
    const [activeEventId, setActiveEventId] = useState<string | null>(null);

    const dataValue = useMemo(() => ({
        events: persistence.events,
        setEvents: persistence.setEvents,
        year: persistence.year,
        setYear: persistence.setYear,
        monthsToShow: persistence.monthsToShow,
        setMonthsToShow: persistence.setMonthsToShow,
        theme: persistence.theme,
        setTheme: persistence.setTheme,
        isInitialLoadDone: persistence.isInitialLoadDone,
    }), [persistence.events, persistence.setEvents, persistence.year, persistence.setYear, persistence.monthsToShow, persistence.setMonthsToShow, persistence.theme, persistence.setTheme, persistence.isInitialLoadDone]);

    const interactionValue = useMemo(() => ({
        isDragging: dragSelection.isDragging,
        dragStart: dragSelection.dragStart,
        dragCurrent: dragSelection.dragCurrent,
        selectionMode: dragSelection.selectionMode,
        activeEventId,
        setActiveEventId,
        startDrag: dragSelection.startDrag,
        updateDrag: dragSelection.updateDrag,
        endDrag: dragSelection.endDrag,
        isHighlighted: dragSelection.isHighlighted,
        onTouchStart: dragSelection.onTouchStart,
        onTouchMove: dragSelection.onTouchMove,
        onTouchEnd: dragSelection.onTouchEnd,
        onContextMenu: dragSelection.onContextMenu,
    }), [dragSelection, activeEventId]);

    const displayValue = useMemo(() => ({
        highlightToday: persistence.highlightToday,
        setHighlightToday: persistence.setHighlightToday,
        showWeekends: persistence.showWeekends,
        setShowWeekends: persistence.setShowWeekends,
        showDayProgress: persistence.showDayProgress,
        setShowDayProgress: persistence.setShowDayProgress,
        weekdayAlign: persistence.weekdayAlign,
        setWeekdayAlign: persistence.setWeekdayAlign,
    }), [persistence.highlightToday, persistence.setHighlightToday, persistence.showWeekends, persistence.setShowWeekends, persistence.showDayProgress, persistence.setShowDayProgress, persistence.weekdayAlign, persistence.setWeekdayAlign]);

    return (
        <PlannerDataProvider value={dataValue}>
            <PlannerInteractionProvider value={interactionValue}>
                <PlannerDisplayProvider value={displayValue}>
                    {children}
                </PlannerDisplayProvider>
            </PlannerInteractionProvider>
        </PlannerDataProvider>
    );
};

// Facade for backward compatibility
export const usePlanner = () => {
    const data = usePlannerData();
    const interaction = usePlannerInteraction();
    const display = usePlannerDisplay();

    return {
        ...data,
        ...interaction,
        ...display
    };
};
