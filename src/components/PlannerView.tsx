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
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { usePlannerModals } from '../hooks/usePlannerModals';
import { useEventOperations } from '../hooks/useEventOperations';


interface PlannerViewProps {
    user: User | null;
    signOut: () => void;
    isGuest: boolean;
    setIsGuest: (v: boolean) => void;
}

const PlannerView: React.FC<PlannerViewProps> = ({ user, signOut, isGuest, setIsGuest }) => {
    const {
        year,
        events,
        setEvents,
        theme,
        undo
    } = usePlanner();

    const today = new Date();
    const { modalState, openCreate, openList, openSettings, close, updateListEvents } = usePlannerModals();
    const { createEvent, updateEvent, deleteEvent, createEventFromDate } = useEventOperations(setEvents, undo);

    useKeyboardShortcuts();

    // Visibility State
    const [todayInView, setTodayInView] = useState(false);

    // Selection State
    const activeRange = modalState.type === 'CREATE' ? modalState.range : null;
    const activeList = modalState.type === 'LIST' ? modalState : null;

    // Effects
    useEffect(() => {
        document.body.setAttribute('data-theme', theme);
    }, [theme]);

    // Handlers
    const handleRangeComplete = (range: EventRange) => {
        openCreate(range);
    };

    const handleEventClickWithDate = (e: React.MouseEvent, allEventsOnDay: PlannerEvent[], m: number, d: number) => {
        e.stopPropagation();
        openList(
            { year, month: m, day: d },
            allEventsOnDay
        );
    };

    const handleSaveNewEvent = (title: string, colorIndex: number, icon?: string) => {
        if (modalState.type !== 'CREATE') return;

        const startStr = toDateStr(modalState.range.start.year, modalState.range.start.month, modalState.range.start.day);
        const endStr = toDateStr(modalState.range.end.year, modalState.range.end.month, modalState.range.end.day);

        createEvent({
            title,
            start: startStr,
            end: endStr,
            color: colorIndex,
            icon
        });
        close();
    };

    const handleUpdateEvent = (updatedEvent: PlannerEvent) => {
        updateEvent(updatedEvent);
        if (modalState.type === 'LIST') {
            const newEvents = modalState.events.map(ev => ev.id === updatedEvent.id ? updatedEvent : ev);
            updateListEvents(newEvents);
        }
    };

    const handleDelete = (id: string) => {
        deleteEvent(id, () => {
            if (modalState.type === 'LIST') {
                const nextSelected = modalState.events.filter(ev => ev.id !== id);
                if (nextSelected.length === 0) {
                    close();
                } else {
                    updateListEvents(nextSelected);
                }
            }
        });
    };

    const handleAddFromList = () => {
        if (modalState.type !== 'LIST') return;
        const { year, month, day } = modalState.date;
        const newEvent = createEventFromDate(year, month, day);

        updateListEvents([...modalState.events, newEvent]);
    };

    return (
        <div className="app-container">
            <AppHeader
                todayInView={todayInView}
                onSettingsClick={openSettings}
            />

            <PlannerGrid
                onEventClick={handleEventClickWithDate}
                setTodayInView={setTodayInView}
                onRangeSelection={handleRangeComplete}
            />

            {modalState.type === 'CREATE' && activeRange && (
                <EventModal
                    range={activeRange}
                    onClose={close}
                    onSave={handleSaveNewEvent}
                />
            )}

            {modalState.type === 'LIST' && activeList && (
                <EventListModal
                    events={activeList.events}
                    date={activeList.date}
                    onClose={close}
                    onDelete={handleDelete}
                    onUpdate={handleUpdateEvent}
                    onAdd={handleAddFromList}
                />
            )}

            {modalState.type === 'SETTINGS' && (
                <SettingsModal
                    onClose={close}
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
