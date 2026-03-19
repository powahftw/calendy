import type { Dispatch, SetStateAction } from 'react';
import { PlannerEvent, EventDraft, uid, toDateStr } from '../utils/calendarUtils';
import { logger } from '../utils/logger';
import { showUndoToast } from '../utils/showUndoToast';

export const useEventOperations = (
    setEvents: Dispatch<SetStateAction<PlannerEvent[]>>,
    undo: () => void
) => {
    const createDraftEvent = ({ title, start, end, color, icon }: EventDraft): PlannerEvent => {
        // Allow empty title if an icon is present (Icon-only event)
        // Otherwise default to 'New Event'
        const finalTitle = title?.trim() || (icon ? '' : 'New Event');

        return {
            id: uid(),
            title: finalTitle,
            start,
            end,
            color,
            icon
        };
    };

    const createEvent = (draft: EventDraft) => {
        const newEvent = createDraftEvent(draft);
        logger.info('Creating new event:', newEvent);
        setEvents(prevEvents => [...prevEvents, newEvent]);
        return newEvent;
    };

    const updateEvent = (updatedEvent: PlannerEvent) => {
        logger.info('Updating event:', updatedEvent);
        setEvents(prevEvents => prevEvents.map(ev => ev.id === updatedEvent.id ? updatedEvent : ev));
    };

    const deleteEvent = (id: string, onSuccess?: () => void) => {
        logger.info('Deleting event ID:', id);
        setEvents(prevEvents => prevEvents.filter(ev => ev.id !== id));
        showUndoToast('Event deleted.', undo);
        if (onSuccess) onSuccess();
    };

    const createEventFromDate = (year: number, month: number, day: number) => {
        const dateStr = toDateStr(year, month, day);
        return createEvent({
            start: dateStr,
            end: dateStr,
            color: 0
        });
    };

    return { createEvent, updateEvent, deleteEvent, createEventFromDate };
};
