import React, { useState, useMemo } from 'react';
import { User } from 'firebase/auth';
import usePlannerPersistence from '../hooks/usePlannerPersistence';
import { PlannerMetaProvider } from './PlannerMetaContext';
import { PlannerEventsProvider } from './PlannerEventsContext';
import { PlannerInteractionProvider } from './PlannerInteractionContext';
import { PlannerDisplayProvider } from './PlannerDisplayContext'; // Legacy support or keep for display settings?

// Merging PlannerDisplayContext into PlannerMetaContext in this refactor
// but for now I'll check if I need to keep it or if I merged it.
// Checked PlannerMetaContext: it has highlightToday, showWeekends, etc.
// So PlannerDisplayContext is effectively merged into PlannerMetaContext.

export interface AppProviderProps {
    user: User | null;
    children: React.ReactNode;
}

export const AppProvider: React.FC<AppProviderProps> = ({ user, children }) => {
    const persistence = usePlannerPersistence(user);
    const [activeEventId, setActiveEventId] = useState<string | null>(null);

    // 1. Meta Context (Time, Theme, System, Display Settings)
    const metaValue = useMemo(() => ({
        year: persistence.year,
        setYear: persistence.setYear,
        monthsToShow: persistence.monthsToShow,
        setMonthsToShow: persistence.setMonthsToShow,

        theme: persistence.theme,
        setTheme: persistence.setTheme,

        highlightToday: persistence.highlightToday,
        setHighlightToday: persistence.setHighlightToday,
        showWeekends: persistence.showWeekends,
        setShowWeekends: persistence.setShowWeekends,
        showDayProgress: persistence.showDayProgress,
        setShowDayProgress: persistence.setShowDayProgress,
        weekdayAlign: persistence.weekdayAlign,
        setWeekdayAlign: persistence.setWeekdayAlign,

        isInitialLoadDone: persistence.isInitialLoadDone,
    }), [
        persistence.year,
        persistence.monthsToShow,
        persistence.theme,
        persistence.highlightToday,
        persistence.showWeekends,
        persistence.showDayProgress,
        persistence.weekdayAlign,
        persistence.isInitialLoadDone,
        // Setters are stable
        persistence.setYear,
        persistence.setMonthsToShow,
        persistence.setTheme,
        persistence.setHighlightToday,
        persistence.setShowWeekends,
        persistence.setShowDayProgress,
        persistence.setWeekdayAlign,
    ]);

    // 2. Events Context (Data, CRUD, Undo)
    // Needs year and monthsToShow for internal filtering
    const eventsValue = useMemo(() => ({
        events: persistence.events,
        setEvents: persistence.setEvents,
        year: persistence.year,
        monthsToShow: persistence.monthsToShow,
        canUndo: persistence.canUndo,
        undo: persistence.undo,
    }), [
        persistence.events,
        persistence.year,
        persistence.monthsToShow,
        persistence.canUndo,
        persistence.undo,
        persistence.setEvents
    ]);

    // 3. Interaction Context (Selection)
    const interactionValue = useMemo(() => ({
        activeEventId,
        setActiveEventId,
    }), [activeEventId]);

    return (
        <PlannerMetaProvider value={metaValue}>
            <PlannerEventsProvider value={eventsValue}>
                <PlannerInteractionProvider value={interactionValue}>
                    {children}
                </PlannerInteractionProvider>
            </PlannerEventsProvider>
        </PlannerMetaProvider>
    );
};
