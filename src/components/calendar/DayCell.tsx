import React, { FC } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { PlannerEvent, STRIPED_COLOR_INDEX, DOTTED_COLOR_INDEX, TRANSPARENT_COLOR_INDEX, getDisplayEvent } from '../../utils/calendarUtils';
import { useTheme } from '../../hooks/useTheme';
import { DayNumber, EventPreview, EventShadow, OverflowIndicator } from './DayCellSubComponents';


type DayCellProps =
    | {
        type: 'spacer' | 'filler';
    }
    | {
        type: 'day';
        date: {
            year: number;
            month: number;
            day: number;
        };
        events: PlannerEvent[];
        appearance: {
            isHighlighted: boolean;
            isWeekend: boolean;
            showWeekends: boolean;
            activeEventId: string | null;
            dragPreviewEvent: PlannerEvent | null;
        };
        today: {
            isToday: boolean;
        };
        interactions: {
            onEventClick: (e: React.MouseEvent, allEventsOnDay: PlannerEvent[], y: number, m: number, d: number) => void;
            onMouseDown: (y: number, m: number, d: number) => void;
            onMouseEnter: (y: number, m: number, d: number) => void;
            onTouchStart: (e: React.TouchEvent, y: number, m: number, d: number) => void;
            onTouchMove: (e: React.TouchEvent) => void;
            onTouchEnd: () => void;
            onMouseUp: () => void;
        };
    };

const DraggableEventChip: FC<{
    event: PlannerEvent;
    day: number;
    month: number;
    year: number;
    hasOverflow: boolean;
    color: string;
    isActive: boolean;
    onClick: (e: React.MouseEvent) => void;
}> = ({ event, day, month, year, hasOverflow, color, isActive, onClick }) => {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: `${event.id}-${year}-${month}-${day}`,
        data: {
            event,
            current: { day, month, year }
        }
    });

    const isStriped = event.color === STRIPED_COLOR_INDEX;
    const isDotted = event.color === DOTTED_COLOR_INDEX;
    const isTransparent = event.color === TRANSPARENT_COLOR_INDEX;

    let className = "event-chip-common draggable-chip-style";
    if (isStriped) className += " event-striped";
    else if (isDotted) className += " event-dotted";
    else if (isTransparent) className += " event-transparent";
    if (hasOverflow) className += " has-overflow";

    const dndStyle: React.CSSProperties = {
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.5 : (isActive ? 0.6 : 1),
        zIndex: isDragging ? 200 : undefined,
        touchAction: 'manipulation',
    };

    dndStyle.paddingLeft = '4px';

    if (!isTransparent) {
        if (!isStriped && !isDotted) {
            dndStyle.backgroundColor = `${color}15`;
            dndStyle.borderLeft = `2px solid ${color}`;
        } else {
            dndStyle.borderLeft = `2px solid ${color}`;
            const customProps = dndStyle as React.CSSProperties & Record<string, string>;
            customProps['--event-color-bg'] = `${color}15`;
            customProps['--event-color-stripe'] = `${color}30`;
            customProps['--event-color-dot'] = `${color}80`;
        }
    }

    return (
        <div
            ref={setNodeRef}
            style={dndStyle}
            {...listeners}
            {...attributes}
            onMouseDown={(e) => {
                e.stopPropagation();
                if (listeners?.onMouseDown) listeners.onMouseDown(e);
            }}
            onTouchStart={(e) => {
                e.stopPropagation();
                if (listeners?.onTouchStart) listeners.onTouchStart(e);
            }}
            onClick={onClick}
            className={className}
        >
            <div className="event-chip-content">
                {event.title && (
                    <span className="event-chip-title">{event.title}</span>
                )}
                {event.icon && (
                    <span className="event-chip-icon">
                        {event.icon}
                    </span>
                )}
            </div>
        </div>
    );
};

const InteractiveDayCell: FC<Extract<DayCellProps, { type: 'day' }>> = ({ date, events, appearance, today, interactions }) => {
    const { date: dayDate, events: dayEvents, appearance: dayAppearance, today: todayState, interactions: dayInteractions } = {
        date,
        events,
        appearance,
        today,
        interactions,
    };
    const { year, month, day } = dayDate;
    const { isHighlighted, isWeekend, showWeekends, activeEventId, dragPreviewEvent } = dayAppearance;
    const { isToday } = todayState;
    const { onEventClick, onMouseDown, onMouseEnter, onTouchStart, onTouchMove, onTouchEnd, onMouseUp } = dayInteractions;

    const currentColors = useTheme();
    const { isOver, setNodeRef } = useDroppable({
        id: `day-${year}-${month}-${day}`,
        data: { year, month, day }
    });

    const mainEvent = dayEvents[0];
    const displayEvent = React.useMemo(() => getDisplayEvent(dayEvents) || mainEvent, [dayEvents, mainEvent]);

    const hiddenEvents = dayEvents.slice(1);
    const hasOverflow = hiddenEvents.length > 0;

    const cellClassName = `day-cell ${isWeekend && showWeekends ? 'weekend' : ''} ${isHighlighted ? 'highlighted' : ''} ${isToday ? 'today today-marker' : ''}`;

    const droppableStyle: React.CSSProperties = {
        backgroundColor: isOver ? 'var(--accent-light)' : undefined,
    };

    return (
        <div
            ref={setNodeRef}
            className={cellClassName}
            style={droppableStyle}
            data-year={year}
            data-month={month}
            data-day={day}
            onMouseDown={(e) => {
                if (e.button === 0) onMouseDown(year, month, day);
            }}
            onMouseEnter={() => onMouseEnter(year, month, day)}
            onTouchStart={(e) => onTouchStart(e, year, month, day)}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onMouseUp={onMouseUp}
        >
            <DayNumber value={day} />

            {dragPreviewEvent && (
                <EventPreview
                    event={dragPreviewEvent}
                    hasConflict={dayEvents.length > 0}
                    currentColors={currentColors}
                />
            )}

            {mainEvent && displayEvent && (
                <>
                    {activeEventId === mainEvent.id && (
                        <EventShadow
                            event={displayEvent}
                            hasOverflow={hasOverflow}
                            color={currentColors[displayEvent.color] || currentColors[0]}
                        />
                    )}

                    <DraggableEventChip
                        event={displayEvent}
                        day={day}
                        month={month}
                        year={year}
                        hasOverflow={hasOverflow}
                        color={currentColors[displayEvent.color] || currentColors[0]}
                        isActive={activeEventId === mainEvent.id}
                        onClick={(e) => onEventClick(e, dayEvents, year, month, day)}
                    />
                </>
            )}

            {hasOverflow && (
                <OverflowIndicator
                    events={hiddenEvents}
                    currentColors={currentColors}
                    onClick={(e) => onEventClick(e, dayEvents, year, month, day)}
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

