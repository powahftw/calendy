import { db } from '../firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { PlannerEvent, PlannerSettings, ThemeId } from './calendarUtils';
import { PlannerData } from '../hooks/usePlannerState';
import { logger } from './logger';

const STORAGE_PREFIX = 'planner_v2_';

export interface LocalStorageState {
    data: PlannerData;
    updatedAt: number;
}

export const getDefaultData = (): PlannerData => ({
    events: [],
    settings: {
        theme: 'blue' as ThemeId,
        highlightToday: true,
        showWeekends: true,
        showDayProgress: true,
        weekdayAlign: true,
        year: 2026,
        monthsToShow: 12
    }
});

export const loadFromLocalStorage = (userId: string): LocalStorageState => {
    try {
        const key = `${STORAGE_PREFIX}${userId}`;
        const raw = localStorage.getItem(key);
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                // Check if it's a valid v2 state object
                if (parsed && typeof parsed === 'object' && 'data' in parsed && parsed.data.events) {
                    return parsed as LocalStorageState;
                }
                logger.warn('localStorage data missing required "data" or "events" fields');
            } catch (e) {
                logger.error('Failed to parse localStorage data:', e);
            }
        }

        // Return default data if no v2 data found
        return {
            data: getDefaultData(),
            updatedAt: 0
        };


    } catch (error) {
        logger.error('Failed to load from localStorage:', error);
        return {
            data: getDefaultData(),
            updatedAt: 0
        };
    }
};

export const saveToLocalStorage = (userId: string, data: PlannerData, updatedAt: number) => {
    try {
        const key = `${STORAGE_PREFIX}${userId}`;
        const state: LocalStorageState = { data, updatedAt };
        localStorage.setItem(key, JSON.stringify(state));
    } catch (error) {
        logger.error('Failed to save to localStorage:', error);
    }
};

