import { PlannerSettings } from '../utils/calendarUtils';
import { logger } from '../utils/logger';

/**
 * Only settings are persisted. Calendar events come from the Google Calendar
 * API and are cached in the browser, so there is no event slice to reconcile.
 */

export type ActionType =
    | 'HYDRATE_LOCAL'
    | 'LOCAL_STORAGE_UPDATE'
    | 'USER_CHANGE'
    | 'REMOTE_UPDATE'
    | 'SYNC_CONFIRMED'
    | 'RESET';

export interface PlannerData {
    settings: PlannerSettings;
}

export interface PlannerState {
    data: PlannerData;
    metadata: {
        lastActionType: ActionType | null;
        settingsUpdatedAt: number;
        isDirty: boolean;
        isHydrated: boolean;
    };
}

export type Action =
    | { type: 'HYDRATE_LOCAL'; payload: PlannerData; settingsUpdatedAt: number; pendingSync: boolean }
    | { type: 'LOCAL_STORAGE_UPDATE'; payload: PlannerData; settingsUpdatedAt: number; pendingSync: boolean }
    | { type: 'USER_CHANGE'; payload: Partial<PlannerSettings>; timestamp: number }
    | { type: 'REMOTE_UPDATE'; payload: Partial<PlannerSettings>; timestamp: number }
    | { type: 'SYNC_CONFIRMED'; settingsUpdatedAt: number }
    | { type: 'RESET'; initialState: PlannerState };

export const plannerReducer = (state: PlannerState, action: Action): PlannerState => {
    switch (action.type) {
        case 'HYDRATE_LOCAL':
            if (state.metadata.isHydrated) return state;

            logger.info('Hydrating from LocalStorage', action.payload);
            return {
                data: action.payload,
                metadata: {
                    lastActionType: 'HYDRATE_LOCAL',
                    settingsUpdatedAt: action.settingsUpdatedAt,
                    isDirty: action.pendingSync,
                    isHydrated: true
                }
            };

        case 'LOCAL_STORAGE_UPDATE':
            if (action.settingsUpdatedAt <= state.metadata.settingsUpdatedAt) {
                logger.info('Ignoring stale LocalStorage update', {
                    incoming: action.settingsUpdatedAt,
                    local: state.metadata.settingsUpdatedAt
                });
                return state;
            }

            logger.info('Applying LocalStorage update from another tab', action.payload);
            return {
                data: action.payload,
                metadata: {
                    lastActionType: 'LOCAL_STORAGE_UPDATE',
                    settingsUpdatedAt: action.settingsUpdatedAt,
                    isDirty: action.pendingSync,
                    isHydrated: true
                }
            };

        case 'USER_CHANGE':
            logger.info('User Change detected:', action.payload);
            return {
                data: { settings: { ...state.data.settings, ...action.payload } },
                metadata: {
                    lastActionType: 'USER_CHANGE',
                    settingsUpdatedAt: action.timestamp,
                    isDirty: true,
                    isHydrated: true
                }
            };

        case 'REMOTE_UPDATE':
            if (action.timestamp <= state.metadata.settingsUpdatedAt) {
                logger.info('Ignoring stale remote update', {
                    remote: action.timestamp,
                    local: state.metadata.settingsUpdatedAt
                });
                return state;
            }

            logger.info('Applying Remote Update', action.payload);
            return {
                data: { settings: { ...state.data.settings, ...action.payload } },
                metadata: {
                    lastActionType: 'REMOTE_UPDATE',
                    settingsUpdatedAt: action.timestamp,
                    isDirty: false,
                    isHydrated: true
                }
            };

        case 'SYNC_CONFIRMED':
            // A change made while the write was in flight keeps the slice dirty.
            if (action.settingsUpdatedAt !== state.metadata.settingsUpdatedAt) return state;

            return {
                ...state,
                metadata: {
                    ...state.metadata,
                    lastActionType: 'SYNC_CONFIRMED',
                    isDirty: false
                }
            };

        case 'RESET':
            logger.info('Resetting state to initial');
            return action.initialState;

        default:
            return state;
    }
};
