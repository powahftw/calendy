import { ThemeId } from './calendarUtils';
import { PendingSyncState, PlannerData, SliceTimestamps } from '../hooks/usePlannerState';
import { logger } from './logger';

export const getTimestampInMillis = (timestamp: any): number => {
    if (!timestamp) return 0;
    if (typeof timestamp.toMillis === 'function') {
        return timestamp.toMillis();
    }
    return typeof timestamp === 'number' ? timestamp : 0;
};

export const STORAGE_PREFIX = 'planner_v2_';
const EMPTY_PENDING_SYNC: PendingSyncState = { events: false, settings: false };

const isObject = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null
);

const isSliceTimestamps = (value: unknown): value is SliceTimestamps => (
    isObject(value)
    && typeof value.events === 'number'
    && typeof value.settings === 'number'
);

const isPendingSyncState = (value: unknown): value is PendingSyncState => (
    isObject(value)
    && typeof value.events === 'boolean'
    && typeof value.settings === 'boolean'
);

export interface LocalStorageState {
    data: PlannerData;
    updatedAt: number;
    timestamps: SliceTimestamps;
    pendingSyncSlices: PendingSyncState;
}

export const getDefaultData = (): PlannerData => ({
    events: [],
    settings: {
        theme: 'blue' as ThemeId,
        highlightToday: true,
        showWeekends: true,
        showDayProgress: true,
        weekdayAlign: true,
        year: new Date().getFullYear(),
        startMonth: 0,
        monthsToShow: 12
    }
});

export const getLocalStorageKey = (userId: string) => `${STORAGE_PREFIX}${userId}`;

export const parseLocalStorageState = (raw: string | null): LocalStorageState | null => {
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw);

        if (
            !parsed
            || typeof parsed !== 'object'
            || !('data' in parsed)
            || !parsed.data
            || !Array.isArray((parsed.data as PlannerData).events)
        ) {
            logger.warn('localStorage data missing required "data" or "events" fields');
            return null;
        }

        const updatedAt = typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0;
        const timestamps = isSliceTimestamps(parsed.timestamps)
            ? parsed.timestamps
            : {
                events: updatedAt,
                settings: updatedAt
            };
        const pendingSyncSlices = isPendingSyncState(parsed.pendingSyncSlices)
            ? parsed.pendingSyncSlices
            : EMPTY_PENDING_SYNC;

        return {
            data: parsed.data as PlannerData,
            updatedAt: Math.max(timestamps.events, timestamps.settings),
            timestamps,
            pendingSyncSlices
        };
    } catch (e) {
        logger.error('Failed to parse localStorage data:', e);
        return null;
    }
};

export const loadFromLocalStorage = (userId: string): LocalStorageState => {
    try {
        const raw = localStorage.getItem(getLocalStorageKey(userId));
        const parsed = parseLocalStorageState(raw);
        if (parsed) {
            return parsed;
        }

        return {
            data: getDefaultData(),
            updatedAt: 0,
            timestamps: {
                events: 0,
                settings: 0
            },
            pendingSyncSlices: EMPTY_PENDING_SYNC,
        };

    } catch (error) {
        logger.error('Failed to load from localStorage:', error);
        return {
            data: getDefaultData(),
            updatedAt: 0,
            timestamps: {
                events: 0,
                settings: 0
            },
            pendingSyncSlices: EMPTY_PENDING_SYNC,
        };
    }
};

export const saveToLocalStorage = (
    userId: string,
    data: PlannerData,
    timestamps: SliceTimestamps,
    pendingSyncSlices: PendingSyncState = EMPTY_PENDING_SYNC
) => {
    try {
        const state: LocalStorageState = {
            data,
            updatedAt: Math.max(timestamps.events, timestamps.settings),
            timestamps,
            pendingSyncSlices
        };
        localStorage.setItem(getLocalStorageKey(userId), JSON.stringify(state));
    } catch (error) {
        logger.error('Failed to save to localStorage:', error);
    }
};

