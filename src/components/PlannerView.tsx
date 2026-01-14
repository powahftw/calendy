import React, { useState } from 'react';
import { usePlanner } from '../context/PlannerContext';
import { PlannerEvent, EventRange, RangeDate, toDateStr, uid, getThemeColors } from '../utils/calendarUtils';
import PlannerGrid from './PlannerGrid';
import AppHeader from './AppHeader';
import SettingsModal from './SettingsModal';
import EventModal from './EventModal';
import EventListModal from './EventListModal';
import { User } from 'firebase/auth';

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
        theme
    } = usePlanner();

    // App UI State
    const [weekdayAlign, setWeekdayAlign] = useState(true);
    const [showSettings, setShowSettings] = useState(false);
    const [modalType, setModalType] = useState<'create' | 'list' | null>(null);

    // Visibility State
    const [todayInView, setTodayInView] = useState(false);

    // Selection State
    const [selectedDateEvents, setSelectedDateEvents] = useState<PlannerEvent[]>([]);
    const [tempRange, setTempRange] = useState<EventRange | null>(null);
    const [clickedDate, setClickedDate] = useState<RangeDate | null>(null);

    // Handlers
    const handleRangeComplete = (range: EventRange) => {
        setTempRange(range);
        setModalType('create');
        setSelectedDateEvents([]);
    };

    const handleMouseUp = () => {
        endDrag(handleRangeComplete);
    };

    const handleEventClickWithDate = (e: React.MouseEvent, allEventsOnDay: PlannerEvent[], m: number, d: number) => {
        e.stopPropagation();
        setSelectedDateEvents(allEventsOnDay);
        setClickedDate({ year, month: m, day: d });
        setModalType('list');
    };

    const saveNewEvent = (title: string, colorIndex: number) => {
        if (!tempRange) return;
        if (!title.trim()) title = "New Event";
        const startStr = toDateStr(tempRange.start.year, tempRange.start.month, tempRange.start.day);
        const endStr = toDateStr(tempRange.end.year, tempRange.end.month, tempRange.end.day);

        const newEvent: PlannerEvent = {
            id: uid(),
            title,
            start: startStr,
            end: endStr,
            color: colorIndex
        };
        setEvents([...events, newEvent]);
        setModalType(null);
    };

    const handleUpdateEvent = (updatedEvent: PlannerEvent) => {
        setEvents(events.map(ev => ev.id === updatedEvent.id ? updatedEvent : ev));
        setSelectedDateEvents(selectedDateEvents.map(ev => ev.id === updatedEvent.id ? updatedEvent : ev));
    };

    const handleDeleteEvent = (id: string) => {
        setEvents(events.filter(ev => ev.id !== id));
        const newSelected = selectedDateEvents.filter(ev => ev.id !== id);
        setSelectedDateEvents(newSelected);
        if (newSelected.length === 0) setModalType(null);
    };

    const handleAddFromList = () => {
        if (!clickedDate) return;
        const dateStr = toDateStr(clickedDate.year, clickedDate.month, clickedDate.day);
        const newEvent: PlannerEvent = {
            id: uid(),
            title: "New Event",
            start: dateStr,
            end: dateStr,
            color: 0
        };
        setEvents([...events, newEvent]);
        setSelectedDateEvents([...selectedDateEvents, newEvent]);
    };

    // Derived
    const currentColors = getThemeColors(theme);

    return (
        <div
            className={`app-container ${selectionMode ? 'selection-mode' : ''}`}
            onMouseUp={handleMouseUp}
            onContextMenu={onContextMenu}
        >
            <AppHeader
                todayInView={todayInView}
                onSettingsClick={() => setShowSettings(true)}
            />

            <PlannerGrid
                weekdayAlign={weekdayAlign}
                onEventClick={handleEventClickWithDate}
                setTodayInView={setTodayInView}
                onRangeSelection={handleRangeComplete}
            />

            {modalType === 'create' && tempRange && (
                <EventModal
                    range={tempRange}
                    onClose={() => setModalType(null)}
                    onSave={saveNewEvent}
                    palette={currentColors}
                />
            )}

            {modalType === 'list' && clickedDate && (
                <EventListModal
                    events={selectedDateEvents}
                    date={clickedDate}
                    onClose={() => setModalType(null)}
                    onDelete={handleDeleteEvent}
                    onUpdate={handleUpdateEvent}
                    onAdd={handleAddFromList}
                    palette={currentColors}
                />
            )}

            {showSettings && (
                <SettingsModal
                    weekdayAlign={weekdayAlign}
                    setWeekdayAlign={setWeekdayAlign}
                    onClose={() => setShowSettings(false)}
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
