import React, { FC } from 'react';
import { DayEvents, getPillEmoji } from '../../utils/calendarEvents';
import DayPill from './DayPill';

interface DayCellProps {
    dayKey: string;
    year: number;
    month: number;
    day: number;
    events: DayEvents;
    /** Theme palette, passed down so a cell needs no context of its own. */
    colors: string[];
    isWeekend: boolean;
    isToday: boolean;
    /** Columns on the left of the grid open their popovers to the right. */
    flipPopover: boolean;
}

/**
 * Props are deliberately flat primitives plus values that are stable across
 * renders (`events` comes from a memoized map, `colors` from the theme). That
 * is what lets React.memo actually skip the ~440 cells in a year view.
 */
const DayCell: FC<DayCellProps> = React.memo(({
    dayKey,
    year,
    month,
    day,
    events,
    colors,
    isWeekend,
    isToday,
    flipPopover
}) => {
    const [chipEvent, ...stackedEvents] = events.allDay;
    const hasPill = events.pill.length > 0;

    // The chip reserves room for what the pill will actually draw: it is only
    // wide when the pill shows both an emoji and a count.
    const pillIsWide = events.pill.length > 1 && getPillEmoji(events.pill) !== undefined;
    const chipClassName = hasPill
        ? `event-chip-common has-pill ${pillIsWide ? 'has-pill-wide' : ''}`
        : 'event-chip-common';

    const className = [
        'day-cell',
        isWeekend ? 'weekend' : '',
        isToday ? 'today today-marker' : ''
    ].filter(Boolean).join(' ');

    return (
        <div className={className} data-year={year} data-month={month} data-day={day}>
            <span className="day-num">{day}</span>

            {chipEvent && (
                <div
                    className={chipClassName}
                    style={{
                        backgroundColor: `${colors[chipEvent.color] || colors[0]}15`,
                        borderLeft: `2px solid ${colors[chipEvent.color] || colors[0]}`,
                        paddingLeft: '4px'
                    }}
                    title={events.allDay.map((event) => event.title).join('\n')}
                >
                    <div className="event-chip-content">
                        <span className="event-chip-title">{chipEvent.title}</span>
                    </div>
                </div>
            )}

            {/* Thin bars standing in for the all-day events the chip hid. */}
            {stackedEvents.length > 0 && !hasPill && (
                <div className="event-overflow" aria-hidden="true">
                    <div className="overflow-lines">
                        {stackedEvents.map((event) => (
                            <div
                                key={event.id}
                                className="overflow-line"
                                style={{ backgroundColor: colors[event.color] || colors[0] }}
                            />
                        ))}
                    </div>
                </div>
            )}

            {hasPill && (
                <DayPill
                    dayKey={dayKey}
                    year={year}
                    month={month}
                    day={day}
                    events={events.pill}
                    flipPopover={flipPopover}
                />
            )}
        </div>
    );
});

export default DayCell;
