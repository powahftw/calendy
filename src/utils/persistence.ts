import { ThemeId } from './calendarUtils';
import { PlannerData } from '../hooks/usePlannerState';
import { logger } from './logger';

export const getTimestampInMillis = (timestamp: unknown): number => {
    if (!timestamp) return 0;
    if (typeof timestamp === 'object' && typeof (timestamp as { toMillis?: unknown }).toMillis === 'function') {
        return (timestamp as { toMillis: () => number }).toMillis();
    }
    return typeof timestamp === 'number' ? timestamp : 0;
};

// v3 dropped the events slice: settings are the only thing Calendy persists.
const STORAGE_PREFIX = 'planner_v3_';

const isObject = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null
);

export interface LocalStorageState {
    data: PlannerData;
    updatedAt: number;
    pendingSync: boolean;
}

export const getDefaultData = (): PlannerData => ({
    settings: {
        theme: 'blue' as ThemeId,
        highlightToday: true,
        showWeekends: true,
        showDayProgress: true,
        weekdayAlign: true,
        pillForAllTimedEvents: false,
        year: new Date().getFullYear(),
        startMonth: 0,
        monthsToShow: 12
    }
});

export const getLocalStorageKey = (userId: string) => `${STORAGE_PREFIX}${userId}`;

export const parseLocalStorageState = (raw: string | null): LocalStorageState | null => {
    if (!raw) return null;

    try {
        const parsed: unknown = JSON.parse(raw);

        if (!isObject(parsed) || !isObject(parsed.data) || !isObject((parsed.data as Record<string, unknown>).settings)) {
            logger.warn('localStorage data missing required "data.settings" field');
            return null;
        }

        const storedData = parsed.data as unknown as PlannerData;

        return {
            // Merge over defaults so a setting added later is never undefined.
            data: { settings: { ...getDefaultData().settings, ...storedData.settings } },
            updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
            pendingSync: parsed.pendingSync === true
        };
    } catch (e) {
        logger.error('Failed to parse localStorage data:', e);
        return null;
    }
};

const getEmptyState = (): LocalStorageState => ({
    data: getDefaultData(),
    updatedAt: 0,
    pendingSync: false
});

export const loadFromLocalStorage = (userId: string): LocalStorageState => {
    try {
        return parseLocalStorageState(localStorage.getItem(getLocalStorageKey(userId))) ?? getEmptyState();
    } catch (error) {
        logger.error('Failed to load from localStorage:', error);
        return getEmptyState();
    }
};

export const saveToLocalStorage = (
    userId: string,
    data: PlannerData,
    updatedAt: number,
    pendingSync = false
) => {
    try {
        const state: LocalStorageState = { data, updatedAt, pendingSync };
        localStorage.setItem(getLocalStorageKey(userId), JSON.stringify(state));
    } catch (error) {
        logger.error('Failed to save to localStorage:', error);
    }
};
