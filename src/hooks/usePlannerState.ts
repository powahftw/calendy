import { PlannerSettings } from '../utils/calendarUtils';
import { logger } from '../utils/logger';

/**
 * Only settings are persisted, so this is a single last-write-wins slice.
 * `updatedAt` decides between a local edit and an incoming remote one.
 */
export interface PlannerState {
    settings: PlannerSettings;
    updatedAt: number;
    /** Local edits not yet acknowledged by Firestore. */
    isDirty: boolean;
    isHydrated: boolean;
}

export type Action =
    | { type: 'HYDRATE_LOCAL'; settings: PlannerSettings; updatedAt: number; isDirty: boolean }
    | { type: 'USER_CHANGE'; settings: Partial<PlannerSettings>; updatedAt: number }
    | { type: 'REMOTE_UPDATE'; settings: Partial<PlannerSettings>; updatedAt: number }
    | { type: 'SYNC_CONFIRMED'; updatedAt: number };

export const plannerReducer = (state: PlannerState, action: Action): PlannerState => {
    switch (action.type) {
        case 'HYDRATE_LOCAL':
            return {
                settings: action.settings,
                updatedAt: action.updatedAt,
                isDirty: action.isDirty,
                isHydrated: true
            };

        case 'USER_CHANGE':
            return {
                settings: { ...state.settings, ...action.settings },
                updatedAt: action.updatedAt,
                isDirty: true,
                isHydrated: true
            };

        case 'REMOTE_UPDATE':
            if (action.updatedAt <= state.updatedAt) {
                logger.info('Ignoring stale remote settings', { remote: action.updatedAt, local: state.updatedAt });
                return state;
            }

            return {
                settings: { ...state.settings, ...action.settings },
                updatedAt: action.updatedAt,
                isDirty: false,
                isHydrated: true
            };

        case 'SYNC_CONFIRMED':
            // An edit made while the write was in flight keeps the slice dirty.
            return action.updatedAt === state.updatedAt ? { ...state, isDirty: false } : state;
    }
};
