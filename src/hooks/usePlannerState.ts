import { PlannerEvent, PlannerSettings } from '../utils/calendarUtils';
import { logger } from '../utils/logger';

export type ActionType =
    | 'HYDRATE_LOCAL'
    | 'HYDRATE_REMOTE'
    | 'LOCAL_STORAGE_UPDATE'
    | 'USER_CHANGE'
    | 'REMOTE_UPDATE'
    | 'SYNC_CONFIRMED'
    | 'RESET'
    | 'UNDO';

export interface PlannerData {
    events: PlannerEvent[];
    settings: PlannerSettings;
}

export interface PendingSyncState {
    events: boolean;
    settings: boolean;
}

export interface SliceTimestamps {
    events: number;
    settings: number;
}

export interface PlannerState {
    data: PlannerData;
    history: PlannerData[];
    metadata: {
        lastActionType: ActionType | null;
        updatedAt: number;
        eventsUpdatedAt: number;
        settingsUpdatedAt: number;
        dirtySlices: PendingSyncState;
        isHydrated: boolean;
    };
}

export type Action =
    | { type: 'HYDRATE_LOCAL'; payload: PlannerData; timestamps: SliceTimestamps; pendingSync: PendingSyncState }
    | { type: 'HYDRATE_REMOTE'; payload: PlannerData; timestamps: SliceTimestamps }
    | { type: 'LOCAL_STORAGE_UPDATE'; payload: PlannerData; timestamps: SliceTimestamps; pendingSync: PendingSyncState }
    | { type: 'USER_CHANGE'; payload: { events?: PlannerEvent[]; settings?: Partial<PlannerSettings> }; timestamp: number }
    | { type: 'REMOTE_UPDATE'; payload: { events?: PlannerEvent[]; settings?: Partial<PlannerSettings> }; timestamp: number }
    | { type: 'SYNC_CONFIRMED'; slices: { events: number | null; settings: number | null } }
    | { type: 'RESET'; initialState: PlannerState }
    | { type: 'UNDO'; timestamp: number };

const MAX_HISTORY_LENGTH = 20;
const EMPTY_PENDING_SYNC: PendingSyncState = { events: false, settings: false };
const getUpdatedAt = (timestamps: SliceTimestamps) => Math.max(timestamps.events, timestamps.settings);

export const plannerReducer = (state: PlannerState, action: Action): PlannerState => {
    switch (action.type) {
        case 'HYDRATE_LOCAL':
            if (state.metadata.isHydrated) return state;
            logger.info('Hydrating from LocalStorage', action.payload);
            {
                return {
                    data: action.payload,
                    history: [],
                    metadata: {
                        lastActionType: 'HYDRATE_LOCAL',
                        updatedAt: getUpdatedAt(action.timestamps),
                        eventsUpdatedAt: action.timestamps.events,
                        settingsUpdatedAt: action.timestamps.settings,
                        dirtySlices: action.pendingSync,
                        isHydrated: true
                    }
                };
            }
        case 'HYDRATE_REMOTE':
            logger.info('Hydrating from Remote (Firestore)', action.payload);
            return {
                data: action.payload,
                history: [],
                metadata: {
                    lastActionType: 'HYDRATE_REMOTE',
                    updatedAt: getUpdatedAt(action.timestamps),
                    eventsUpdatedAt: action.timestamps.events,
                    settingsUpdatedAt: action.timestamps.settings,
                    dirtySlices: EMPTY_PENDING_SYNC,
                    isHydrated: true
                }
            };
        case 'LOCAL_STORAGE_UPDATE':
            {
            const applyEvents = action.timestamps.events > state.metadata.eventsUpdatedAt;
            const applySettings = action.timestamps.settings > state.metadata.settingsUpdatedAt;

            if (!applyEvents && !applySettings) {
                logger.info('Ignoring stale LocalStorage update', {
                    incomingEvents: action.timestamps.events,
                    incomingSettings: action.timestamps.settings,
                    localEvents: state.metadata.eventsUpdatedAt,
                    localSettings: state.metadata.settingsUpdatedAt
                });
                return state;
            }

            logger.info('Applying LocalStorage update from another tab', action.payload);
            const nextTimestamps = {
                events: applyEvents ? action.timestamps.events : state.metadata.eventsUpdatedAt,
                settings: applySettings ? action.timestamps.settings : state.metadata.settingsUpdatedAt
            };

            return {
                data: {
                    events: applyEvents ? action.payload.events : state.data.events,
                    settings: applySettings ? action.payload.settings : state.data.settings
                },
                history: state.history,
                metadata: {
                    lastActionType: 'LOCAL_STORAGE_UPDATE',
                    updatedAt: getUpdatedAt(nextTimestamps),
                    eventsUpdatedAt: nextTimestamps.events,
                    settingsUpdatedAt: nextTimestamps.settings,
                    dirtySlices: {
                        events: applyEvents ? action.pendingSync.events : state.metadata.dirtySlices.events,
                        settings: applySettings ? action.pendingSync.settings : state.metadata.dirtySlices.settings
                    },
                    isHydrated: true
                }
            };
            }
        case 'USER_CHANGE':
            {
            logger.info('User Change detected:', action.payload);
            const changedEvents = action.payload.events !== undefined;
            const changedSettings = action.payload.settings !== undefined;
            const nextTimestamps = {
                events: changedEvents ? action.timestamp : state.metadata.eventsUpdatedAt,
                settings: changedSettings ? action.timestamp : state.metadata.settingsUpdatedAt
            };
            const nextData: PlannerData = {
                events: action.payload.events ?? state.data.events,
                settings: action.payload.settings ? { ...state.data.settings, ...action.payload.settings } : state.data.settings
            };
            const nextHistory = [...state.history, state.data].slice(-MAX_HISTORY_LENGTH);
            return {
                data: nextData,
                history: nextHistory,
                metadata: {
                    lastActionType: 'USER_CHANGE',
                    updatedAt: getUpdatedAt(nextTimestamps),
                    eventsUpdatedAt: nextTimestamps.events,
                    settingsUpdatedAt: nextTimestamps.settings,
                    dirtySlices: {
                        events: state.metadata.dirtySlices.events || changedEvents,
                        settings: state.metadata.dirtySlices.settings || changedSettings
                    },
                    isHydrated: true
                }
            };
            }
        case 'UNDO':
            if (state.history.length === 0) {
                logger.info('Nothing to undo');
                return state;
            }

            logger.info('Undoing last action');
            {
                const timestamp = action.timestamp;
                const timestamps = { events: timestamp, settings: timestamp };

            return {
                data: state.history[state.history.length - 1],
                history: state.history.slice(0, -1),
                metadata: {
                    lastActionType: 'UNDO',
                    updatedAt: getUpdatedAt(timestamps),
                    eventsUpdatedAt: timestamps.events,
                    settingsUpdatedAt: timestamps.settings,
                    dirtySlices: {
                        events: true,
                        settings: true
                    },
                    isHydrated: true
                }
            };
            }
        case 'REMOTE_UPDATE':
            {
            const hasEventsUpdate = action.payload.events !== undefined;
            const hasSettingsUpdate = action.payload.settings !== undefined;
            const applyEvents = hasEventsUpdate && action.timestamp > state.metadata.eventsUpdatedAt;
            const applySettings = hasSettingsUpdate && action.timestamp > state.metadata.settingsUpdatedAt;

            if (!applyEvents && !applySettings) {
                logger.info('Ignoring stale remote update', {
                    remote: action.timestamp,
                    localEvents: state.metadata.eventsUpdatedAt,
                    localSettings: state.metadata.settingsUpdatedAt
                });
                return state;
            }

            logger.info('Applying Remote Update', action.payload);
            const nextTimestamps = {
                events: applyEvents ? action.timestamp : state.metadata.eventsUpdatedAt,
                settings: applySettings ? action.timestamp : state.metadata.settingsUpdatedAt
            };
            return {
                data: {
                    events: applyEvents ? action.payload.events ?? state.data.events : state.data.events,
                    settings: applySettings && action.payload.settings
                        ? { ...state.data.settings, ...action.payload.settings }
                        : state.data.settings
                },
                history: state.history,
                metadata: {
                    lastActionType: 'REMOTE_UPDATE',
                    updatedAt: getUpdatedAt(nextTimestamps),
                    eventsUpdatedAt: nextTimestamps.events,
                    settingsUpdatedAt: nextTimestamps.settings,
                    dirtySlices: {
                        events: applyEvents ? false : state.metadata.dirtySlices.events,
                        settings: applySettings ? false : state.metadata.dirtySlices.settings
                    },
                    isHydrated: true
                }
            };
            }
        case 'SYNC_CONFIRMED':
            {
            const dirtySlices = {
                events: action.slices.events === state.metadata.eventsUpdatedAt ? false : state.metadata.dirtySlices.events,
                settings: action.slices.settings === state.metadata.settingsUpdatedAt ? false : state.metadata.dirtySlices.settings
            };

            return {
                ...state,
                metadata: {
                    ...state.metadata,
                    lastActionType: 'SYNC_CONFIRMED',
                    dirtySlices
                }
            };
            }
        case 'RESET':
            logger.info('Resetting state to initial');
            return action.initialState;
        default:
            return state;
    }
};
