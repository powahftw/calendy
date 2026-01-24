import { useState } from 'react';
import { PlannerEvent, EventRange, RangeDate } from '../utils/calendarUtils';

export type ModalState =
    | { type: 'NONE' }
    | { type: 'CREATE'; range: EventRange }
    | { type: 'LIST'; date: RangeDate; events: PlannerEvent[] }
    | { type: 'SETTINGS' };

export const usePlannerModals = () => {
    const [modalState, setModalState] = useState<ModalState>({ type: 'NONE' });

    const openCreate = (range: EventRange) => setModalState({ type: 'CREATE', range });

    const openList = (date: RangeDate, events: PlannerEvent[]) => setModalState({ type: 'LIST', date, events });

    const openSettings = () => setModalState({ type: 'SETTINGS' });

    const close = () => setModalState({ type: 'NONE' });

    // Helper to update list events if currently open
    const updateListEvents = (updatedEvents: PlannerEvent[]) => {
        if (modalState.type === 'LIST') {
            setModalState({
                ...modalState,
                events: updatedEvents
            });
        }
    };

    return {
        modalState,
        openCreate,
        openList,
        openSettings,
        close,
        updateListEvents
    };
};
