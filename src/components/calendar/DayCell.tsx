import React, { FC, useCallback, useRef } from 'react';
import { usePlannerInteraction } from '../../context/PlannerContext';
import type { DayEvents } from '../../utils/calendarEvents';
import { monthNames } from '../../utils/calendarUtils';
import { getEventStylePresentation } from '../../utils/eventStylePresentation';

interface DayCellProps {
    dayKey: string;
    year: number;
    month: number;
    day: number;
    events: DayEvents;
    colors: string[];
    isWeekend: boolean;
    isToday: boolean;
}

const DayCell: FC<DayCellProps> = React.memo(({
    dayKey,
    year,
    month,
    day,
    events,
    colors,
    isWeekend,
    isToday
}) => {
    const triggerRef = useRef<HTMLButtonElement>(null);
    const {
        showDayDetails,
        scheduleDayDetailsClose,
        cancelDayDetailsClose
    } = usePlannerInteraction();
    const primaryEvent = events.allDay[0];
    const eventCount = events.allDay.length + events.timed.length;
    const hiddenCount = eventCount - (primaryEvent ? 1 : 0);
    const presentation = primaryEvent
        ? getEventStylePresentation(primaryEvent.color, colors)
        : null;

    const reveal = useCallback((pinned: boolean) => {
        if (triggerRef.current) showDayDetails(dayKey, triggerRef.current, pinned);
    }, [dayKey, showDayDetails]);

    const className = [
        'day-cell',
        isWeekend ? 'weekend' : '',
        isToday ? 'today today-marker' : ''
    ].filter(Boolean).join(' ');
    const label = `${eventCount} event${eventCount === 1 ? '' : 's'} on ${day} ${monthNames[month]} ${year}`;

    return (
        <div className={className} data-year={year} data-month={month} data-day={day}>
            <span className="day-num">{day}</span>

            {eventCount > 0 && (
                <button
                    ref={triggerRef}
                    type="button"
                    className={primaryEvent
                        ? `event-chip-common event-summary-trigger ${hiddenCount > 0 ? 'has-overlap' : ''} ${presentation?.className || ''}`
                        : 'day-overlap-trigger'}
                    style={presentation?.style}
                    aria-label={label}
                    aria-haspopup="dialog"
                    onMouseEnter={() => reveal(false)}
                    onMouseLeave={scheduleDayDetailsClose}
                    onFocus={() => reveal(true)}
                    onClick={() => reveal(true)}
                    onPointerEnter={cancelDayDetailsClose}
                >
                    {primaryEvent && (
                        <span className="event-chip-title">{primaryEvent.title}</span>
                    )}
                    {hiddenCount > 0 && (
                        <span className="event-overlap-count" aria-hidden="true">+{hiddenCount}</span>
                    )}
                </button>
            )}
        </div>
    );
});

export default DayCell;
