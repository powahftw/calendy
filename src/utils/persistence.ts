import { PlannerSettings } from './calendarUtils';
import { logger } from './logger';

export const getTimestampInMillis = (timestamp: unknown): number => {
    if (typeof timestamp === 'number') return timestamp;
    if (typeof timestamp === 'object' && typeof (timestamp as { toMillis?: unknown })?.toMillis === 'function') {
        return (timestamp as { toMillis: () => number }).toMillis();
    }
    return 0;
};

// v3 dropped the events slice: settings are the only thing Calendy persists.
const STORAGE_PREFIX = 'planner_v3_';

export interface StoredSettings {
    settings: PlannerSettings;
    updatedAt: number;
    pendingSync: boolean;
}

export const getDefaultSettings = (): PlannerSettings => ({
    theme: 'blue',
    highlightToday: true,
    showWeekends: true,
    showDayProgress: true,
    weekdayAlign: true,
    year: new Date().getFullYear(),
    startMonth: 0,
    monthsToShow: 12
});

const getStorageKey = (userId: string) => `${STORAGE_PREFIX}${userId}`;

export const loadFromLocalStorage = (userId: string): StoredSettings => {
    const empty: StoredSettings = { settings: getDefaultSettings(), updatedAt: 0, pendingSync: false };

    try {
        const raw = localStorage.getItem(getStorageKey(userId));
        if (!raw) return empty;

        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null) return empty;

        const { settings, updatedAt, pendingSync } = parsed as Partial<StoredSettings>;
        if (typeof settings !== 'object' || settings === null) return empty;

        return {
            // Merged over the defaults so a setting added later is never undefined.
            settings: { ...empty.settings, ...settings },
            updatedAt: typeof updatedAt === 'number' ? updatedAt : 0,
            pendingSync: pendingSync === true
        };
    } catch (error) {
        logger.error('Failed to load settings from localStorage:', error);
        return empty;
    }
};

export const saveToLocalStorage = (
    userId: string,
    settings: PlannerSettings,
    updatedAt: number,
    pendingSync: boolean
) => {
    try {
        const stored: StoredSettings = { settings, updatedAt, pendingSync };
        localStorage.setItem(getStorageKey(userId), JSON.stringify(stored));
    } catch (error) {
        logger.error('Failed to save settings to localStorage:', error);
    }
};
