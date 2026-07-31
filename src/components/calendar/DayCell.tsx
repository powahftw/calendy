import React, { FC } from 'react';
import { CalendarEvent, DayEvents, getPillEmoji } from '../../utils/calendarEvents';
import { useTheme } from '../../hooks/useTheme';
import { DayNumber, EventChip, StackedEventBars } from './DayCellSubComponents';
import DayPill from './DayPill';

type DayCellProps =
    | { type: 'spacer' | 'filler' }
    | {
        type: 'day';
        dayKey: string;
        date: {
            year: number;
            month: number;
            day: number;
        };
        events: DayEvents;
        appearance: {
            isWeekend: boolean;
            showWeekends: boolean;
            isToday: boolean;
            flipPopover: boolean;
        };
        pill: {
            isOpen: boolean;
            onOpenChange: (open: boolean) => void;
        };
    };

const getChipTitle = (allDayEvents: CalendarEvent[]): string => (
    allDayEvents.map((event) => event.title).join('\n')
);

const InteractiveDayCell: FC<Extract<DayCellProps, { type: 'day' }>> = ({
    dayKey,
    date,
    events,
    appearance,
    pill
}) => {
    const { year, month, day } = date;
    const { isWeekend, showWeekends, isToday, flipPopover } = appearance;

    const currentColors = useTheme();

    const [mainEvent, ...stackedEvents] = events.allDay;
    const hasPill = events.pill.length > 0;
    // The chip has to reserve room for what the pill will actually draw: both
    // an emoji and a count only when the pill shows both.
    const pillIsWide = hasPill && events.pill.length > 1 && getPillEmoji(events.pill) !== undefined;
    const pillOffset = !hasPill ? 'none' : pillIsWide ? 'pill-wide' : 'pill';

    const cellClassName = [
        'day-cell',
        isWeekend && showWeekends ? 'weekend' : '',
        isToday ? 'today today-marker' : ''
    ].filter(Boolean).join(' ');

    return (
        <div
            className={cellClassName}
            data-year={year}
            data-month={month}
            data-day={day}
        >
            <DayNumber value={day} />

            {mainEvent && (
                <EventChip
                    event={mainEvent}
                    color={currentColors[mainEvent.color] || currentColors[0]}
                    pillOffset={pillOffset}
                    title={getChipTitle(events.allDay)}
                />
            )}

            {stackedEvents.length > 0 && !hasPill && (
                <StackedEventBars events={stackedEvents} currentColors={currentColors} />
            )}

            {hasPill && (
                <DayPill
                    dayKey={dayKey}
                    date={date}
                    events={events.pill}
                    isOpen={pill.isOpen}
                    onOpenChange={pill.onOpenChange}
                    flipPopover={flipPopover}
                />
            )}
        </div>
    );
};

const DayCell: FC<DayCellProps> = React.memo((props) => {
    if (props.type !== 'day') {
        return <div className="day-cell empty"></div>;
    }

    return <InteractiveDayCell {...props} />;
});

export default DayCell;
