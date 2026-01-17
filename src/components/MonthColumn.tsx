import React, { FC } from 'react';
import { monthNames, getDaysInMonth, getDayOfWeekIndex, isDateInRange, PlannerEvent } from '../utils/calendarUtils';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

interface MonthColumnProps {
    year: number;
    monthIndex: number;
    events: PlannerEvent[];
    currentColors: string[];
    onMouseDown: (m: number, d: number) => void;
    onMouseEnter: (m: number, d: number) => void;
    isHighlighted: (m: number, d: number) => boolean;
    onEventClick: (e: React.MouseEvent, allEventsOnDay: PlannerEvent[], m: number, d: number) => void;
    weekdayAlign: boolean;
    maxRows: number;
    today: {
        todayYear: number;
        todayMonth: number;
        todayDay: number;
    };
    highlightToday: boolean;
    showWeekends: boolean;
    onTouchStart: (e: React.TouchEvent, m: number, d: number) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: () => void;
    dragPreviewEvent?: PlannerEvent | null;
    activeEventId?: string | null;
}

const DraggableEventChip: FC<{
    event: PlannerEvent;
    children: React.ReactNode;
    style?: React.CSSProperties;
    onClick: (e: React.MouseEvent) => void;
    day: number;
    month: number;
    year: number;
    className?: string; // Add className prop
}> = ({ event, children, style, onClick, day, month, year, className }) => { // Destructure it
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: `${event.id}-${year}-${month}-${day}`,
        data: {
            event,
            current: { day, month, year } // Current date of THIS chip
        }
    });

    const dndStyle: React.CSSProperties = {
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 200 : undefined, // Higher z-index while dragging
        touchAction: 'none',
        ...style
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
            className={className} // Apply className
        >
            {children}
        </div>
    );
};

const DroppableDayCell: FC<{
    year: number;
    month: number;
    day: number;
    children: React.ReactNode;
    className: string;
    onMouseDown?: (e: React.MouseEvent) => void;
    onMouseEnter?: () => void;
    onTouchStart?: (e: React.TouchEvent) => void;
    onTouchMove?: (e: React.TouchEvent) => void;
    onTouchEnd?: () => void;
}> = ({ year, month, day, children, className, onMouseDown, onMouseEnter, onTouchStart, onTouchMove, onTouchEnd }) => {
    const { isOver, setNodeRef } = useDroppable({
        id: `day-${year}-${month}-${day}`,
        data: { year, month, day }
    });

    const droppableStyle: React.CSSProperties = {
        backgroundColor: isOver ? 'var(--accent-light)' : undefined,
    };

    return (
        <div
            ref={setNodeRef}
            className={className}
            style={droppableStyle}
            data-month={month}
            data-day={day}
            onMouseDown={onMouseDown}
            onMouseEnter={onMouseEnter}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
        >
            {children}
        </div>
    );
};


const MonthColumn: FC<MonthColumnProps> = ({
    year,
    monthIndex,
    events,
    currentColors,
    onMouseDown,
    onMouseEnter,
    isHighlighted,
    onEventClick,
    weekdayAlign,
    maxRows,
    today,
    highlightToday,
    showWeekends,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    dragPreviewEvent,
    activeEventId
}) => {
    const daysInMonth = getDaysInMonth(year, monthIndex);

    let spacerCount = 0;
    if (weekdayAlign) {
        const firstDayIndex = getDayOfWeekIndex(year, monthIndex, 1);
        spacerCount = firstDayIndex;
    }

    const cells: { type: 'spacer' | 'day' | 'filler'; id?: string; val?: number }[] = [];
    for (let i = 0; i < spacerCount; i++) cells.push({ type: 'spacer', id: `sp-${i}` });
    for (let i = 1; i <= daysInMonth; i++) cells.push({ type: 'day', val: i });
    const totalProvided = cells.length;
    for (let i = totalProvided; i < maxRows; i++) cells.push({ type: 'filler', id: `fl-${i}` });

    return (
        <div className="month-col">
            <div className="month-header unselectable">{monthNames[monthIndex]}</div>

            {cells.map((cell, index) => {
                if (cell.type === 'spacer' || cell.type === 'filler') {
                    return <div key={cell.id || index} className="day-cell empty"></div>;
                }

                const day = cell.val!;
                const highlighted = isHighlighted(monthIndex, day);
                const dayEvents = events.filter(ev => isDateInRange(year, monthIndex, day, ev.start, ev.end));
                const hasEvents = dayEvents.length > 0;
                const hiddenEvents = dayEvents.slice(1);
                const hasOverflow = hiddenEvents.length > 0;

                const dayIdx = getDayOfWeekIndex(year, monthIndex, day);
                const isWeekend = dayIdx === 5 || dayIdx === 6;

                const isToday = highlightToday && year === today.todayYear && monthIndex === today.todayMonth && day === today.todayDay;

                const mainEventColor = hasEvents ? currentColors[dayEvents[0].color] || currentColors[0] : null;

                return (
                    <DroppableDayCell
                        key={day}
                        year={year}
                        month={monthIndex}
                        day={day}
                        className={`day-cell ${isWeekend && showWeekends ? 'weekend' : ''} ${highlighted ? 'highlighted' : ''} ${isToday ? 'today' : ''} ${isToday ? 'today-marker' : ''}`}
                        onMouseDown={(e) => {
                            if (e.button === 0) onMouseDown(monthIndex, day);
                        }}
                        onMouseEnter={() => onMouseEnter(monthIndex, day)}
                        onTouchStart={(e) => onTouchStart(e, monthIndex, day)}
                        onTouchMove={onTouchMove}
                        onTouchEnd={onTouchEnd}
                    >
                        <span className="day-num">{day}</span>

                        {dragPreviewEvent && isDateInRange(year, monthIndex, day, dragPreviewEvent.start, dragPreviewEvent.end) && (
                            hasEvents ? (
                                <div className="event-overflow preview-overflow" style={{ pointerEvents: 'none', zIndex: 11 }}>
                                    <div className="overflow-lines">
                                        <div
                                            className="overflow-line"
                                            style={{
                                                backgroundColor: currentColors[dragPreviewEvent.color] || currentColors[0],
                                                opacity: 0.6,
                                                border: '1px dashed rgba(255,255,255,0.4)',
                                                boxSizing: 'border-box'
                                            }}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div
                                    className="event-chip-common preview-chip-style"
                                    style={{
                                        backgroundColor: (currentColors[dragPreviewEvent.color] || currentColors[0]) + '45',
                                        borderLeft: `2px solid ${currentColors[dragPreviewEvent.color] || currentColors[0]}`,
                                    }}
                                >
                                    <span style={{ color: 'var(--text-primary)', opacity: 0.8 }}>{dragPreviewEvent.title}</span>
                                </div>
                            )
                        )}

                        {hasEvents && (
                            <>
                                {/* Static shadow that stays behind if any part of this event is being dragged */}
                                {activeEventId === dayEvents[0].id && (
                                    <div
                                        className="event-chip-common"
                                        style={{
                                            right: hasOverflow ? '6px' : '2px',
                                            paddingRight: hasOverflow ? '12px' : '4px',
                                            paddingLeft: '4px',
                                            backgroundColor: `${mainEventColor}15`,
                                            borderLeft: `2px solid ${mainEventColor}`,
                                            opacity: 0.25,
                                            zIndex: 2,
                                            pointerEvents: 'none'
                                        }}
                                    >
                                        <span style={{
                                            color: 'var(--text-primary)',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            width: '100%',
                                            userSelect: 'none'
                                        }}>{dayEvents[0].title}</span>
                                    </div>
                                )}

                                <DraggableEventChip
                                    event={dayEvents[0]}
                                    day={day}
                                    month={monthIndex}
                                    year={year}
                                    className="event-chip-common draggable-chip-style"
                                    style={{
                                        right: hasOverflow ? '6px' : '2px',
                                        paddingRight: hasOverflow ? '12px' : '4px',
                                        paddingLeft: '4px',
                                        backgroundColor: `${mainEventColor}15`,
                                        borderLeft: `2px solid ${mainEventColor}`,
                                        opacity: activeEventId === dayEvents[0].id ? 0.6 : 1,
                                    }}
                                    onClick={(e) => onEventClick(e, dayEvents, monthIndex, day)}
                                >
                                    <span style={{
                                        color: 'var(--text-primary)',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        width: '100%',
                                        userSelect: 'none'
                                    }}>{dayEvents[0].title}</span>
                                </DraggableEventChip>
                            </>
                        )}

                        {hasOverflow && (
                            <div
                                className="event-overflow"
                                onClick={(e) => onEventClick(e, dayEvents, monthIndex, day)}
                                onMouseDown={(e) => e.stopPropagation()}
                            >
                                <div className="overflow-lines">
                                    {hiddenEvents.map((ev, i) => (
                                        <div key={i} className="overflow-line" style={{ backgroundColor: currentColors[ev.color] || currentColors[0] }} />
                                    ))}
                                </div>
                            </div>
                        )}
                    </DroppableDayCell>
                );
            })}
        </div>
    );
};

export default MonthColumn;
