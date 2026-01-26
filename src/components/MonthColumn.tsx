import React, { FC, useMemo } from 'react';
import { monthNames, getDayOfWeekIndex, PlannerEvent, isDateInRange, getDateKey } from '../utils/calendarUtils';
import { usePlannerMeta } from '../context/PlannerMetaContext';
import { usePlannerEvents } from '../context/PlannerEventsContext';
import { usePlannerInteraction } from '../context/PlannerInteractionContext';
import { generateMonthLayout } from '../utils/calendar/layoutCalculations';
import DayCell from './calendar/DayCell';

interface MonthColumnProps {
    monthIndex: number;
    onEventClick: (e: React.MouseEvent, allEventsOnDay: PlannerEvent[], m: number, d: number) => void;
    maxRows: number;
    today: {
        todayYear: number;
        todayMonth: number;
        todayDay: number;
    };
    onTouchEnd: () => void;
    dragPreviewEvent?: PlannerEvent | null;

    // Drag Props
    startDrag: (m: number, d: number) => void;
    updateDrag: (m: number, d: number) => void;
    isHighlighted: (m: number, d: number) => boolean;
    onTouchStart: (e: React.TouchEvent, m: number, d: number) => void;
    onTouchMove: (e: React.TouchEvent) => void;
}

const MonthColumn: FC<MonthColumnProps> = ({
    monthIndex,
    onEventClick,
    maxRows,
    today,
    onTouchEnd,
    dragPreviewEvent,
    startDrag,
    updateDrag,
    isHighlighted,
    onTouchStart,
    onTouchMove
}) => {
    const { year, weekdayAlign, showWeekends, highlightToday } = usePlannerMeta();
    const { eventMap } = usePlannerEvents();
    const { activeEventId } = usePlannerInteraction();

    const layout = useMemo(() => generateMonthLayout({
        year,
        monthIndex,
        weekdayAlign,
        maxRows
    }), [year, monthIndex, weekdayAlign, maxRows]);

    return (
        <div className="month-col">
            <div className="month-header unselectable">{monthNames[monthIndex]}</div>

            {layout.map((cell) => {
                if (cell.type === 'spacer' || cell.type === 'filler') {
                    return (
                        <DayCell
                            key={cell.id}
                            type={cell.type}
                        />
                    );
                }

                const day = cell.day!;
                const dateKey = getDateKey(year, monthIndex, day);
                const eventsOnDay = eventMap.get(dateKey) ?? [];

                const dayIdx = getDayOfWeekIndex(year, monthIndex, day);
                const isWeekend = dayIdx === 5 || dayIdx === 6;
                const isToday = highlightToday && year === today.todayYear && monthIndex === today.todayMonth && day === today.todayDay;

                const showPreview = dragPreviewEvent && isDateInRange(year, monthIndex, day, dragPreviewEvent.start, dragPreviewEvent.end);

                return (
                    <DayCell
                        key={cell.id}
                        type="day"
                        year={year}
                        month={monthIndex}
                        day={day}
                        isWeekend={isWeekend}
                        isToday={isToday}
                        eventsOnDay={eventsOnDay}
                        isHighlighted={isHighlighted(monthIndex, day)}
                        dragPreviewEvent={showPreview ? dragPreviewEvent : null}
                        activeEventId={activeEventId}
                        showWeekends={showWeekends}
                        onEventClick={onEventClick}
                        onMouseDown={startDrag}
                        onMouseEnter={updateDrag}
                        onTouchStart={onTouchStart}
                        onTouchMove={onTouchMove}
                        onTouchEnd={onTouchEnd}
                    />
                );
            })}
        </div>
    );
};

export default MonthColumn;
