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
    /** Day key -> every all-day and timed event touching that day. */
    eventMap: Map<string, DayEvents>;
    cycleEventStyle: (event: CalendarEvent) => void;
    loading: boolean;
    refreshing: boolean;
    error: string | null;
    lastFetchedAt: number | null;
    refresh: () => Promise<void>;
    connection: CalendarConnection;
}

export interface OpenDayDetails {
    dayKey: string;
    anchor: HTMLElement;
    pinned: boolean;
}

/** Stable interaction actions consumed by every occupied day cell. */
export interface PlannerInteractionValue {
    showDayDetails: (dayKey: string, anchor: HTMLElement, pinned?: boolean) => void;
    scheduleDayDetailsClose: () => void;
    cancelDayDetailsClose: () => void;
    closeDayDetails: () => void;
}

/** Volatile state consumed only by the single shared details popover. */
export interface PlannerDetailsStateValue {
    openDayDetails: OpenDayDetails | null;
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
export const [PlannerDetailsStateProvider, usePlannerDetailsState] =
    createRequiredContext<PlannerDetailsStateValue>('PlannerDetailsState');
