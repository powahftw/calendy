import { PlannerEvent, EventDraft, uid, toDateStr } from '../utils/calendarUtils';
import { logger } from '../utils/logger';
import toast from 'react-hot-toast';
import React from 'react';

export const useEventOperations = (
    setEvents: React.Dispatch<React.SetStateAction<PlannerEvent[]>>,
    undo: () => void
) => {

    const showUndoToast = (message: string) => {
        toast.custom((t) => (
            <div
                className= "custom-toast undo-toast"
                onClick = {() => toast.dismiss(t.id)}
role = "button"
tabIndex = { 0}
onKeyDown = {(event) => {
    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toast.dismiss(t.id);
    }
}}
            >
    <span>{ message } </span>
    < button
type = "button"
onClick = {(event) => {
    event.stopPropagation();
    undo();
    toast.dismiss(t.id);
}}
className = "undo-toast-action"
    >
    Undo
    </button>
    </div>
        ), { duration: 5000 });
    };

const createDraftEvent = ({ title, start, end, color }: EventDraft): PlannerEvent => ({
    id: uid(),
    title: title?.trim() ? title : 'New Event',
    start,
    end,
    color
});

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
    showUndoToast('Event deleted.');
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
