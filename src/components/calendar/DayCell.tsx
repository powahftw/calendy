import React, { FC } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { PlannerEvent } from '../../utils/calendarUtils';
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
            onEventClick: (e: React.MouseEvent, allEventsOnDay: PlannerEvent[], m: number, d: number) => void;
            onMouseDown: (m: number, d: number) => void;
            onMouseEnter: (m: number, d: number) => void;
            onTouchStart: (e: React.TouchEvent, m: number, d: number) => void;
            onTouchMove: (e: React.TouchEvent) => void;
            onTouchEnd: () => void;
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

    const dndStyle: React.CSSProperties = {
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.5 : (isActive ? 0.6 : 1),
        zIndex: isDragging ? 200 : undefined,
        touchAction: 'manipulation',
        right: hasOverflow ? '6px' : '2px',
        paddingRight: hasOverflow ? '12px' : '4px',
        paddingLeft: '4px',
        backgroundColor: `${color}15`,
        borderLeft: `2px solid ${color}`,
    };

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
            className="event-chip-common draggable-chip-style"
        >
            <span style={{
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                width: '100%',
                userSelect: 'none'
            }}>{event.title}</span>
        </div>
    );
};

const DayCell: FC<DayCellProps> = React.memo((props) => {
    if (props.type !== 'day') {
        return <div className="day-cell empty"></div>;
    }

    const { date, events, appearance, today, interactions } = props;
    const { year, month, day } = date;
    const { isHighlighted, isWeekend, showWeekends, activeEventId, dragPreviewEvent } = appearance;
    const { isToday } = today;
    const { onEventClick, onMouseDown, onMouseEnter, onTouchStart, onTouchMove, onTouchEnd } = interactions;

    const currentColors = useTheme();
    const { isOver, setNodeRef } = useDroppable({
        id: `day-${year}-${month}-${day}`,
        data: { year, month, day }
    });

    const hasEvents = events.length > 0;
    const mainEvent = events[0];
    const hiddenEvents = events.slice(1);
    const hasOverflow = hiddenEvents.length > 0;
    const mainEventColor = hasEvents ? currentColors[mainEvent.color] || currentColors[0] : null;

    const cellClassName = `day-cell ${isWeekend && showWeekends ? 'weekend' : ''} ${isHighlighted ? 'highlighted' : ''} ${isToday ? 'today today-marker' : ''}`;

    const droppableStyle: React.CSSProperties = {
        backgroundColor: isOver ? 'var(--accent-light)' : undefined,
    };

    return (
        <div
            ref={setNodeRef}
            className={cellClassName}
            style={droppableStyle}
            data-month={month}
            data-day={day}
            onMouseDown={(e) => {
                if (e.button === 0) onMouseDown(month, day);
            }}
            onMouseEnter={() => onMouseEnter(month, day)}
            onTouchStart={(e) => onTouchStart(e, month, day)}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
        >
            <DayNumber value={day} />

            {dragPreviewEvent && (
                <EventPreview
                    event={dragPreviewEvent}
                    hasConflict={hasEvents}
                    currentColors={currentColors}
                />
            )}

            {hasEvents && (
                <>
                    {activeEventId === mainEvent.id && (
                        <EventShadow
                            event={mainEvent}
                            hasOverflow={hasOverflow}
                            color={mainEventColor!}
                        />
                    )}

                    <DraggableEventChip
                        event={mainEvent}
                        day={day}
                        month={month}
                        year={year}
                        hasOverflow={hasOverflow}
                        color={mainEventColor!}
                        isActive={activeEventId === mainEvent.id}
                        onClick={(e) => onEventClick(e, events, month, day)}
                    />
                </>
            )}

            {hasOverflow && (
                <OverflowIndicator
                    events={hiddenEvents}
                    currentColors={currentColors}
                    onClick={(e) => onEventClick(e, events, month, day)}
                />
            )}
        </div>
    );
});

export default DayCell;

