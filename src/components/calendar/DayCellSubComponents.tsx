import React from 'react';
import { CalendarEvent } from '../../utils/calendarEvents';

export const DayNumber: React.FC<{ value: number }> = ({ value }) => (
    <span className="day-num">{value}</span>
);

/**
 * The full-day block, unchanged from the editable planner apart from losing its
 * drag handles. `pillOffset` shortens it so a day pill can sit beside it.
 */
export const EventChip: React.FC<{
    event: CalendarEvent;
    color: string;
    pillOffset: 'none' | 'pill' | 'pill-wide';
    title: string;
}> = ({ event, color, pillOffset, title }) => (
    <div
        className={`event-chip-common ${pillOffset === 'none' ? '' : `has-pill has-${pillOffset}`}`}
        style={{
            backgroundColor: `${color}15`,
            borderLeft: `2px solid ${color}`,
            paddingLeft: '4px'
        }}
        title={title}
    >
        <div className="event-chip-content">
            <span className="event-chip-title">{event.title}</span>
        </div>
    </div>
);

/** Thin colour bars marking the extra full-day events stacked on one day. */
export const StackedEventBars: React.FC<{
    events: CalendarEvent[];
    currentColors: string[];
}> = ({ events, currentColors }) => (
    <div className="event-overflow" aria-hidden="true">
        <div className="overflow-lines">
            {events.map((event) => (
                <div
                    key={event.id}
                    className="overflow-line"
                    style={{ backgroundColor: currentColors[event.color] || currentColors[0] }}
                />
            ))}
        </div>
    </div>
);
