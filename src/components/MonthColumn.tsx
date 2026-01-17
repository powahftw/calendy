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
}

const DraggableEventChip: FC<{
    event: PlannerEvent;
    children: React.ReactNode;
    style?: React.CSSProperties
    onClick: (e: React.MouseEvent) => void;
}> = ({ event, children, style, onClick }) => {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: event.id,
        data: { event }
    });

    const dndStyle: React.CSSProperties = {
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 100 : undefined,
        touchAction: 'none', // Critical for dragging on mobile
        ...style
    };

    return (
        <div
            ref={setNodeRef}
            style={dndStyle}
            {...listeners}
            {...attributes}
            onClick={onClick}
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
    onMouseDown?: () => void;
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
    onTouchEnd
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

                // Resolve Color
                const mainEventColor = hasEvents ? currentColors[dayEvents[0].color] || currentColors[0] : null;

                const dayCellContent = (
                    <>
                        <span className="day-num">{day}</span>

                        {hasEvents && (
                            <DraggableEventChip
                                event={dayEvents[0]}
                                style={{
                                    backgroundColor: `${mainEventColor}15`, // Low opacity bg
                                    borderLeft: `2px solid ${mainEventColor}`
                                }}
                                onClick={(e) => onEventClick(e, dayEvents, monthIndex, day)}
                            >
                                <div
                                    className={`event-chip ${hasOverflow ? 'has-overflow' : ''}`}
                                    style={{
                                        position: 'relative', // Reset absolute from class because Draggable wrapper handles position layout? 
                                        // Actually event-chip has absolute positioning. 
                                        // DraggableEventChip wraps it. We need to be careful with layout.
                                        left: 0, right: 0, top: 0, transform: 'none'
                                        // Wait, event-chip CSS is very specific:
                                        // position: absolute; left: 24px; right: 2px; top: 50%; transform: translateY(-50%);
                                        // If we wrap it, the wrapper needs to be positioned or the child needs to keep it.
                                        // Let's pass the class and style to DraggableEventChip's container instead.
                                    }}
                                    title={dayEvents[0].title}
                                >
                                    <span style={{ color: 'var(--text-primary)' }}>{dayEvents[0].title}</span>
                                </div>
                            </DraggableEventChip>
                        )}

                        {/* Overflow Indicator with Lines ONLY - Not draggable */}
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
                    </>
                );

                // Fix styling update: event-chip in CSS is absolute positioned.
                // We should make DraggableEventChip the absolute positioned element.
                // Let's adjust the DraggableEventChip usage above.

                return (
                    <DroppableDayCell
                        key={day}
                        year={year}
                        month={monthIndex}
                        day={day}
                        className={`day-cell ${isWeekend && showWeekends ? 'weekend' : ''} ${highlighted ? 'highlighted' : ''} ${isToday ? 'today' : ''} ${isToday ? 'today-marker' : ''}`}
                        onMouseDown={() => onMouseDown(monthIndex, day)}
                        onMouseEnter={() => onMouseEnter(monthIndex, day)}
                        onTouchStart={(e) => onTouchStart(e, monthIndex, day)}
                        onTouchMove={onTouchMove}
                        onTouchEnd={onTouchEnd}
                    >
                        <span className="day-num">{day}</span>

                        {hasEvents && (
                            <DraggableEventChip
                                event={dayEvents[0]}
                                style={{
                                    // Match event-chip CSS
                                    position: 'absolute',
                                    left: '24px',
                                    right: hasOverflow ? '6px' : '2px',
                                    top: '50%',
                                    // transform: 'translateY(-50%)' -> This conflicts with dnd transform.
                                    // We need to combine them or use top/margin.
                                    marginTop: '-11px', // Half of height 22px
                                    height: '22px',
                                    borderRadius: '3px',
                                    paddingRight: hasOverflow ? '12px' : '4px',
                                    paddingLeft: '4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    fontSize: '0.75rem',
                                    fontWeight: 500,
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    cursor: 'grab',
                                    boxShadow: '0 1px 1px rgba(0, 0, 0, 0.05)',
                                    backgroundColor: `${mainEventColor}15`,
                                    borderLeft: `2px solid ${mainEventColor}`,
                                    zIndex: 5 // Ensure it's above day num but below dragging
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
