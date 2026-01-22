import React, { useState, useEffect } from 'react';
import { usePlanner } from '../context/PlannerContext';
import { PlannerEvent, EventRange, RangeDate, toDateStr, uid } from '../utils/calendarUtils';
import PlannerGrid from './PlannerGrid';
import AppHeader from './AppHeader';
import SettingsModal from './SettingsModal';
import EventModal from './EventModal';
import EventListModal from './EventListModal';
import { User } from 'firebase/auth';
import { logger } from '../utils/logger';
import toast from 'react-hot-toast';


interface PlannerViewProps {
    user: User | null;
    signOut: () => void;
    isGuest: boolean;
    setIsGuest: (v: boolean) => void;
}

const PlannerView: React.FC<PlannerViewProps> = ({ user, signOut, isGuest, setIsGuest }) => {
    const {
        year,
        endDrag,
        selectionMode,
        onContextMenu,
        events,
        setEvents,
        theme,
        undo
    } = usePlanner();

    // App UI State
    type ModalState =
        | { type: 'NONE' }
        | { type: 'CREATE'; range: EventRange }
        | { type: 'LIST'; date: RangeDate; events: PlannerEvent[] }
        | { type: 'SETTINGS' };

    const [modal, setModal] = useState<ModalState>({ type: 'NONE' });

    // Visibility State
    const [todayInView, setTodayInView] = useState(false);

    // Selection State
    const activeRange = modal.type === 'CREATE' ? modal.range : null;
    const activeList = modal.type === 'LIST' ? modal : null;

    // Effects
    useEffect(() => {
        document.body.setAttribute('data-theme', theme);
    }, [theme]);

    // Handlers
    const handleRangeComplete = (range: EventRange) => {
        setModal({ type: 'CREATE', range });
    };

    const handleMouseUp = () => {
        endDrag(handleRangeComplete);
    };

    const handleEventClickWithDate = (e: React.MouseEvent, allEventsOnDay: PlannerEvent[], m: number, d: number) => {
        e.stopPropagation();
        setModal({
            type: 'LIST',
            date: { year, month: m, day: d },
            events: allEventsOnDay
        });
    };

    type EventDraft = {
        title?: string;
        start: string;
        end: string;
        color: number;
    };

    const createEvent = ({ title, start, end, color }: EventDraft): PlannerEvent => ({
        id: uid(),
        title: title?.trim() ? title : 'New Event',
        start,
        end,
        color
    });

    const showUndoToast = (message: string) => {
        toast.custom((t) => (
            <div className="custom-toast undo-toast">
                <span>{message}</span>
                <button
                    type="button"
                    onClick={() => {
                        undo();
                        toast.dismiss(t.id);
                    }}
                    className="undo-toast-action"
                >
                    Undo
                </button>
            </div>
        ), { duration: 5000 });
    };

    const saveNewEvent = (title: string, colorIndex: number) => {
        if (modal.type !== 'CREATE') return;
        const startStr = toDateStr(modal.range.start.year, modal.range.start.month, modal.range.start.day);
        const endStr = toDateStr(modal.range.end.year, modal.range.end.month, modal.range.end.day);

        const newEvent = createEvent({
            title,
            start: startStr,
            end: endStr,
            color: colorIndex
        });
        logger.info('Creating new event:', newEvent);
        setEvents(prevEvents => [...prevEvents, newEvent]);
        setModal({ type: 'NONE' });
    };

    const handleUpdateEvent = (updatedEvent: PlannerEvent) => {
        logger.info('Updating event:', updatedEvent);
        setEvents(prevEvents => prevEvents.map(ev => ev.id === updatedEvent.id ? updatedEvent : ev));
        if (modal.type === 'LIST') {
            setModal({
                ...modal,
                events: modal.events.map(ev => ev.id === updatedEvent.id ? updatedEvent : ev)
            });
        }
    };

    const handleDeleteEvent = (id: string) => {
        logger.info('Deleting event ID:', id);
        setEvents(prevEvents => prevEvents.filter(ev => ev.id !== id));
        showUndoToast('Event deleted.');
        if (modal.type === 'LIST') {
            const nextSelected = modal.events.filter(ev => ev.id !== id);
            if (nextSelected.length === 0) {
                setModal({ type: 'NONE' });
            } else {
                setModal({
                    ...modal,
                    events: nextSelected
                });
            }
        }
    };

    const handleAddFromList = () => {
        if (modal.type !== 'LIST') return;
        const dateStr = toDateStr(modal.date.year, modal.date.month, modal.date.day);
        const newEvent = createEvent({
            start: dateStr,
            end: dateStr,
            color: 0
        });
        setEvents(prevEvents => [...prevEvents, newEvent]);
        setModal({
            ...modal,
            events: [...modal.events, newEvent]
        });
    };

    return (
        <div
            className={`app-container ${selectionMode ? 'selection-mode' : ''}`}
            onMouseUp={handleMouseUp}
            onContextMenu={onContextMenu}
        >
            <AppHeader
                todayInView={todayInView}
                onSettingsClick={() => setModal({ type: 'SETTINGS' })}
            />

            <PlannerGrid
                onEventClick={handleEventClickWithDate}
                setTodayInView={setTodayInView}
                onRangeSelection={handleRangeComplete}
            />

            {modal.type === 'CREATE' && activeRange && (
                <EventModal
                    range={activeRange}
                    onClose={() => setModal({ type: 'NONE' })}
                    onSave={saveNewEvent}
                />
            )}

            {modal.type === 'LIST' && activeList && (
                <EventListModal
                    events={activeList.events}
                    date={activeList.date}
                    onClose={() => setModal({ type: 'NONE' })}
                    onDelete={handleDeleteEvent}
                    onUpdate={handleUpdateEvent}
                    onAdd={handleAddFromList}
                />
            )}

            {modal.type === 'SETTINGS' && (
                <SettingsModal
                    onClose={() => setModal({ type: 'NONE' })}
                    user={user}
                    onSignOut={() => {
                        if (isGuest) setIsGuest(false);
                        else signOut();
                    }}
                    isGuest={isGuest}
                />
            )}
        </div>
    );
};

export default PlannerView;
