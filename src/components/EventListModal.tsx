import React, { FC, useEffect } from 'react';
import { formatDateRange, monthNames, PlannerEvent, RangeDate } from '../utils/calendarUtils';

interface EventListModalProps {
    events: PlannerEvent[];
    date: RangeDate;
    onClose: () => void;
    onDelete: (id: string) => void;
    onUpdate: (event: PlannerEvent) => void;
    onAdd: () => void;
    palette: string[];
}

const EventListModal: FC<EventListModalProps> = ({ events, date, onClose, onDelete, onUpdate, onAdd, palette }) => {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const cycleColor = (event: PlannerEvent) => {
        // Event color is now an index
        const currentIndex = event.color;
        const nextIndex = (currentIndex + 1) % palette.length;
        onUpdate({ ...event, color: nextIndex });
    };

    return (
        <div className="modal-overlay" onMouseDown={(e: React.MouseEvent) => e.target === e.currentTarget && onClose()}>
            <div className="modal bounce-in">
                <div className="modal-header">
                    <h3>{date.day} {monthNames[date.month]}</h3>
                    <button onClick={onClose} className="close-btn">&times;</button>
                </div>
                <div className="event-list">
                    {events.map(ev => {
                        const isMultiDay = ev.start !== ev.end;
                        const colorHex = palette[ev.color] || palette[0];
                        return (
                            <div key={ev.id} className="event-list-item">
                                <div
                                    className="event-color-indicator clickable"
                                    style={{ backgroundColor: colorHex }}
                                    onClick={() => cycleColor(ev)}
                                    title="Cycle Color"
                                ></div>
                                <div className="event-input-wrapper">
                                    <input
                                        className="event-title-input"
                                        defaultValue={ev.title}
                                        onBlur={(e) => {
                                            if (e.target.value !== ev.title) {
                                                onUpdate({ ...ev, title: e.target.value });
                                            }
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                        }}
                                    />
                                    {isMultiDay && (
                                        <span className="event-date-hint">
                                            {formatDateRange(ev.start, ev.end, 'monthDay')}
                                        </span>
                                    )}
                                </div>
                                <button onClick={() => onDelete(ev.id)} className="btn-icon-danger" title="Delete">
                                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"></path></svg>
                                </button>
                            </div>
                        );
                    })}
                    <div className="add-event-row">
                        <button className="btn-small-dashed" onClick={onAdd}>+ Add Event</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EventListModal;
