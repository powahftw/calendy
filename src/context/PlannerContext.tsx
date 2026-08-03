import { createContext, useContext } from 'react';
import type { PlannerSettings, ThemeId } from '../utils/calendarUtils';
import type { CalendarEvent, DayEvents } from '../utils/calendarEvents';
import type { CalendarConnection } from '../hooks/useCalendarConnection';

export type SyncStatus = 'synced' | 'pending' | 'offline';

/** Everything the planner reads: settings, the calendar, and what it fetched. */
export interface PlannerContextValue extends PlannerSettings {
    setTheme: (theme: ThemeId) => void;
    updateSettings: (updates: Partial<PlannerSettings>) => void;
    navigate: (direction: 1 | -1) => void;
    syncStatus: SyncStatus;

    events: CalendarEvent[];
    /** Day key -> that day's events, split into full-day chips and pill events. */
    eventMap: Map<string, DayEvents>;
    loading: boolean;
    refreshing: boolean;
    error: string | null;
    lastFetchedAt: number | null;
    refresh: () => Promise<void>;
    connection: CalendarConnection;
}

/**
 * Which pill's popover is open. Split from the main context because it changes
 * on every hover, and only the pills care.
 */
export interface PlannerInteractionValue {
    openPillDayKey: string | null;
    setOpenPillDayKey: (dayKey: string | null) => void;
}

const createRequiredContext = <T,>(name: string) => {
    const Context = createContext<T | undefined>(undefined);

    const useRequiredContext = () => {
        const value = useContext(Context);
        if (!value) throw new Error(`use${name} must be used within a ${name}Provider`);
        return value;
    };

    return [Context.Provider, useRequiredContext] as const;
};

export const [PlannerProvider, usePlanner] = createRequiredContext<PlannerContextValue>('Planner');
export const [PlannerInteractionProvider, usePlannerInteraction] =
    createRequiredContext<PlannerInteractionValue>('PlannerInteraction');
