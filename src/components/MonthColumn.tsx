import React, { FC, useMemo } from 'react';
import { monthNames, getDayOfWeekIndex, PlannerEvent, isDateInRange, getDateKey } from '../utils/calendarUtils';
import { usePlannerData, usePlannerInteraction, usePlannerDisplay } from '../context/PlannerContext';
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
}

const MonthColumn: FC<MonthColumnProps> = ({
    monthIndex,
    onEventClick,
    maxRows,
    today,
    onTouchEnd,
    dragPreviewEvent,
}) => {
    const { year, eventMap } = usePlannerData();
    const {
        startDrag, updateDrag, isHighlighted, onTouchStart, onTouchMove, activeEventId
    } = usePlannerInteraction();
    const { weekdayAlign, showWeekends, highlightToday } = usePlannerDisplay();

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
                        date={{ year, month: monthIndex, day }}
                        events={eventsOnDay}
                        appearance={{
                            isHighlighted: isHighlighted(monthIndex, day),
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
                            onTouchEnd
                        }}
                    />
                );
            })}
        </div>
    );
};

export default MonthColumn;
