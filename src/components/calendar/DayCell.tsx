import React, { FC } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { PlannerEvent } from '../../utils/calendarUtils';
import { useTheme } from '../../hooks/useTheme';
import { DayNumber, EventPreview, EventShadow, OverflowIndicator } from './DayCellSubComponents';
import { renderCustomEmoji } from '../../utils/emojiUtils';

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
    hasFlagOnDay?: boolean;
}> = ({ event, day, month, year, hasOverflow, color, isActive, onClick, hasFlagOnDay }) => {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: `${event.id}-${year}-${month}-${day}`,
        data: {
            event,
            current: { day, month, year }
        }
    });

    const isStriped = event.color === 5;
    const isDotted = event.color === 6;
    const isTransparent = event.color === 7;

    const isFlag = event.icon && !event.title;

    let className = "event-chip-common draggable-chip-style";
    if (isStriped) className += " event-striped";
    else if (isDotted) className += " event-dotted";
    else if (isTransparent) className += " event-transparent";

    if (isFlag) className += " flag-chip";
    else if (hasFlagOnDay) className += " has-flag";

    const dndStyle: React.CSSProperties = {
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.5 : (isActive ? 0.6 : 1),
        zIndex: isDragging ? 200 : undefined,
        touchAction: 'manipulation',
    };

    dndStyle.right = hasOverflow ? '6px' : '2px';
    dndStyle.paddingRight = hasOverflow ? '12px' : '4px';
    dndStyle.paddingLeft = '4px';

    if (isTransparent) {
        // Transparent events have no background or border by default (css)
        // Ensure no leftover styles
        dndStyle.backgroundColor = 'transparent';
        dndStyle.border = 'none';
        dndStyle.boxShadow = 'none';
    } else {
        // Base styles for normal events (overridden by classes for striped/dotted)
        if (!isStriped && !isDotted) {
            dndStyle.backgroundColor = `${color}15`;
            dndStyle.borderLeft = `2px solid ${color}`;
        } else {
            // Variables for special styles
            dndStyle.borderLeft = `2px solid ${color}`; // Border color stays solid
            const customProps = dndStyle as React.CSSProperties & Record<string, string>;
            customProps['--event-color-bg'] = `${color}15`;
            customProps['--event-color-stripe'] = `${color}30`; // Subtle stripe
            customProps['--event-color-dot'] = `${color}80`; // Visible dot
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '100%', overflow: 'hidden' }}>
                {event.title && (
                    <span style={{
                        color: 'var(--text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        userSelect: 'none',
                        flex: 1
                    }}>{event.title}</span>
                )}
                {event.icon && (
                    <span className="icon-span" style={{ lineHeight: 1, display: 'flex', alignItems: 'center', flexShrink: 0, marginLeft: 'auto' }}>
                        {renderCustomEmoji(event.icon)}
                    </span>
                )}
            </div>
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
    const { onEventClick, onMouseDown, onMouseEnter, onTouchStart, onTouchMove, onTouchEnd, onMouseUp } = interactions;

    const currentColors = useTheme();
    const { isOver, setNodeRef } = useDroppable({
        id: `day-${year}-${month}-${day}`,
        data: { year, month, day }
    });

    const allEvents = events;
    const flags = allEvents.filter(ev => ev.icon && !ev.title);
    const regularEvents = allEvents.filter(ev => !ev.icon || ev.title);

    const hasRegularEvents = regularEvents.length > 0;
    const mainRegularEvent = regularEvents[0];
    const hiddenRegularEvents = regularEvents.slice(1);
    const hasOverflow = hiddenRegularEvents.length > 0;

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
            onMouseUp={onMouseUp}
        >
            <DayNumber value={day} />

            {dragPreviewEvent && (
                <EventPreview
                    event={dragPreviewEvent}
                    hasConflict={hasRegularEvents || flags.length > 0}
                    currentColors={currentColors}
                />
            )}

            {/* Render all Flags first (or after main? user wants them overlapping/not hidden) */}
            {flags.map(flag => (
                <DraggableEventChip
                    key={flag.id}
                    event={flag}
                    day={day}
                    month={month}
                    year={year}
                    hasOverflow={false} // Flags don't take overflow indicator
                    color="transparent"
                    isActive={activeEventId === flag.id}
                    onClick={(e) => onEventClick(e, allEvents, month, day)}
                />
            ))}

            {hasRegularEvents && (
                <>
                    {activeEventId === mainRegularEvent.id && (
                        <EventShadow
                            event={mainRegularEvent}
                            hasOverflow={hasOverflow}
                            color={currentColors[mainRegularEvent.color] || currentColors[0]}
                        />
                    )}

                    <DraggableEventChip
                        event={mainRegularEvent}
                        day={day}
                        month={month}
                        year={year}
                        hasOverflow={hasOverflow}
                        color={currentColors[mainRegularEvent.color] || currentColors[0]}
                        isActive={activeEventId === mainRegularEvent.id}
                        onClick={(e) => onEventClick(e, allEvents, month, day)}
                        hasFlagOnDay={flags.length > 0}
                    />
                </>
            )}

            {hasOverflow && (
                <OverflowIndicator
                    events={hiddenRegularEvents}
                    currentColors={currentColors}
                    onClick={(e) => onEventClick(e, allEvents, month, day)}
                />
            )}
        </div>
    );
});

export default DayCell;

