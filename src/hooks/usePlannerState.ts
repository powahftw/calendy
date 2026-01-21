import { PlannerEvent, PlannerSettings } from '../utils/calendarUtils';
import { logger } from '../utils/logger';

export type ActionType =
    | 'HYDRATE_LOCAL'
    | 'HYDRATE_REMOTE'
    | 'USER_CHANGE'
    | 'REMOTE_UPDATE'
    | 'RESET';

export interface PlannerData {
    events: PlannerEvent[];
    settings: PlannerSettings;
}

export interface PlannerState {
    data: PlannerData;
    metadata: {
        lastActionType: ActionType | null;
        updatedAt: number;
        isHydrated: boolean;
    };
}

export type Action =
    | { type: 'HYDRATE_LOCAL'; payload: PlannerData; timestamp: number }
    | { type: 'HYDRATE_REMOTE'; payload: PlannerData; timestamp: number }
    | { type: 'USER_CHANGE'; payload: { events?: PlannerEvent[]; settings?: Partial<PlannerSettings> }; timestamp: number }
    | { type: 'REMOTE_UPDATE'; payload: { events?: PlannerEvent[]; settings?: Partial<PlannerSettings> }; timestamp: number }
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
                    updatedAt: action.timestamp,
                    isHydrated: true
                }
            };
        case 'HYDRATE_REMOTE':
            logger.info('Hydrating from Remote (Firestore)', action.payload);
            return {
                data: action.payload,
                metadata: {
                    lastActionType: 'HYDRATE_REMOTE',
                    updatedAt: action.timestamp,
                    isHydrated: true
                }
            };
        case 'USER_CHANGE':
            logger.info('User Change detected:', action.payload);
            return {
                data: {
                    events: action.payload.events ?? state.data.events,
                    settings: action.payload.settings ? { ...state.data.settings, ...action.payload.settings } : state.data.settings
                },
                metadata: {
                    lastActionType: 'USER_CHANGE',
                    updatedAt: action.timestamp,
                    isHydrated: true
                }
            };
        case 'REMOTE_UPDATE':
            // Last-Write-Wins: Only accept if remote is newer
            // Note: If we just hydrated from local, we still want to prefer remote IF it's newer or we have no data.
            const isStale = action.timestamp > 0 && action.timestamp <= state.metadata.updatedAt;

            if (isStale) {
                logger.info('Ignoring stale remote update', { remote: action.timestamp, local: state.metadata.updatedAt });
                return state;
            }

            // If remote is empty and we have local data, ignore it (unless it's actually newer, which isStale handled)
            const remoteIsEmpty = !action.payload.events?.length && !action.payload.settings;
            if (remoteIsEmpty && state.data.events.length > 0) {
                logger.info('Ignoring empty remote update (preserving local data)');
                return state;
            }

            logger.info('Applying Remote Update', action.payload);
            return {
                data: {
                    events: action.payload.events ?? state.data.events,
                    settings: action.payload.settings ? { ...state.data.settings, ...action.payload.settings } : state.data.settings
                },
                metadata: {
                    lastActionType: 'REMOTE_UPDATE',
                    updatedAt: action.timestamp,
                    isHydrated: true
                }
            };
        case 'RESET':
            logger.info('Resetting state to initial');
            return action.initialState;
        default:
            return state;
    }
};
