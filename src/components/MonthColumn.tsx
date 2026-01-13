import React, { FC } from 'react';
import { monthNames, getDaysInMonth, getDayOfWeekIndex, isDateInRange, PlannerEvent } from '../utils/calendarUtils';

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

                return (
                    <div
                        key={day}
                        className={`day-cell ${isWeekend && showWeekends ? 'weekend' : ''} ${highlighted ? 'highlighted' : ''} ${isToday ? 'today' : ''}`}
                        data-month={monthIndex}
                        data-day={day}
                        onMouseDown={() => onMouseDown(monthIndex, day)}
                        onMouseEnter={() => onMouseEnter(monthIndex, day)}
                        onTouchStart={(e) => onTouchStart(e, monthIndex, day)}
                        onTouchMove={onTouchMove}
                        onTouchEnd={onTouchEnd}
                    >
                        <span className="day-num">{day}</span>

                        {hasEvents && (
                            <div
                                className={`event-chip ${hasOverflow ? 'has-overflow' : ''}`}
                                style={{
                                    backgroundColor: `${mainEventColor}15`, // Low opacity bg
                                    borderLeft: `2px solid ${mainEventColor}`
                                }}
                                onClick={(e) => onEventClick(e, dayEvents, monthIndex, day)}
                                onMouseDown={(e) => e.stopPropagation()}
                                title={dayEvents[0].title}
                            >
                                <span style={{ color: 'var(--text-primary)' }}>{dayEvents[0].title}</span>
                            </div>
                        )}

                        {/* Overflow Indicator with Lines ONLY */}
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
                    </div>
                );
            })}
        </div>
    );
};

export default MonthColumn;
