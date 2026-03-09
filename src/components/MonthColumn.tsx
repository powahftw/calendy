import React, { FC, useMemo } from 'react';
import { monthNames, getDayOfWeekIndex, PlannerEvent, isDateInRange, getDateKey } from '../utils/calendarUtils';
import { usePlannerMeta } from '../context/PlannerMetaContext';
import { usePlannerEvents } from '../context/PlannerEventsContext';
import { usePlannerInteraction } from '../context/PlannerInteractionContext';
import { generateMonthLayout } from '../utils/calendar/layoutCalculations';
import DayCell from './calendar/DayCell';

interface MonthColumnProps {
    monthIndex: number; // The visual column index 0,1,2...
    colYear: number;
    colMonth: number;
    onEventClick: (e: React.MouseEvent, allEventsOnDay: PlannerEvent[], y: number, m: number, d: number) => void;
    maxRows: number;
    today: {
        todayYear: number;
        todayMonth: number;
        todayDay: number;
    };
    onTouchEnd: () => void;
    onMouseUp: () => void;
    dragPreviewEvent?: PlannerEvent | null;

    // Drag Props
    startDrag: (y: number, m: number, d: number) => void;
    updateDrag: (y: number, m: number, d: number) => void;
    isHighlighted: (y: number, m: number, d: number) => boolean;
    onTouchStart: (e: React.TouchEvent, y: number, m: number, d: number) => void;
    onTouchMove: (e: React.TouchEvent) => void;
}

const MonthColumn: FC<MonthColumnProps> = ({
    monthIndex,
    colYear,
    colMonth,
    onEventClick,
    maxRows,
    today,
    onTouchEnd,
    onMouseUp,
    dragPreviewEvent,
    startDrag,
    updateDrag,
    isHighlighted,
    onTouchStart,
    onTouchMove
}) => {
    const { weekdayAlign, showWeekends, highlightToday } = usePlannerMeta();
    const { eventMap } = usePlannerEvents();
    const { activeEventId } = usePlannerInteraction();

    const layout = useMemo(() => generateMonthLayout({
        year: colYear,
        monthIndex: colMonth,
        weekdayAlign,
        maxRows
    }), [colYear, colMonth, weekdayAlign, maxRows]);

    return (
        <div className="month-col">
            <div className="month-header unselectable">{monthNames[colMonth]}</div>

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
                const dateKey = getDateKey(colYear, colMonth, day);
                const eventsOnDay = eventMap.get(dateKey) ?? [];

                const dayIdx = getDayOfWeekIndex(colYear, colMonth, day);
                const isWeekend = dayIdx === 5 || dayIdx === 6;
                const isToday = highlightToday && colYear === today.todayYear && colMonth === today.todayMonth && day === today.todayDay;

                const showPreview = dragPreviewEvent && isDateInRange(colYear, colMonth, day, dragPreviewEvent.start, dragPreviewEvent.end);

                return (
                    <DayCell
                        key={cell.id}
                        type="day"
                        date={{ year: colYear, month: colMonth, day }}
                        events={eventsOnDay}
                        appearance={{
                            isHighlighted: isHighlighted(colYear, colMonth, day),
                            isWeekend,
                            showWeekends,
                            activeEventId,
                            dragPreviewEvent: showPreview ? dragPreviewEvent : null
                        }}
                        today={{ isToday }}
                        interactions={{
                            onEventClick,
                            onMouseDown: startDrag,
                            onMouseEnter: updateDrag,
                            onTouchStart,
                            onTouchMove,
                            onTouchEnd,
                            onMouseUp
                        }}
                    />
                );
            })}
        </div>
    );
};

export default MonthColumn;
