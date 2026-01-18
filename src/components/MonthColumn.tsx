import React, { FC, useMemo } from 'react';
import { monthNames, getDayOfWeekIndex, PlannerEvent, isDateInRange } from '../utils/calendarUtils';
import { usePlannerData, usePlannerInteraction, usePlannerDisplay } from '../context/PlannerContext';
import { generateMonthLayout } from '../utils/calendar/layoutCalculations';
import DayCell from './calendar/DayCell';
import { getThemeColors } from '../utils/calendarUtils';

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
    const { year, theme, eventMap } = usePlannerData();
    const {
        startDrag, updateDrag, isHighlighted, onTouchStart, onTouchMove, activeEventId
    } = usePlannerInteraction();
    const { weekdayAlign, showWeekends, highlightToday } = usePlannerDisplay();

    const currentColors = useMemo(() => getThemeColors(theme), [theme]);

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
                    return <div key={cell.id} className="day-cell empty"></div>;
                }

                const day = cell.day!;
                const dateKey = `${year}-${monthIndex}-${day}`;
                const eventsOnDay = eventMap[dateKey] || [];

                const dayIdx = getDayOfWeekIndex(year, monthIndex, day);
                const isWeekend = dayIdx === 5 || dayIdx === 6;
                const isToday = highlightToday && year === today.todayYear && monthIndex === today.todayMonth && day === today.todayDay;

                const showPreview = dragPreviewEvent && isDateInRange(year, monthIndex, day, dragPreviewEvent.start, dragPreviewEvent.end);

                return (
                    <DayCell
                        key={cell.id}
                        year={year}
                        month={monthIndex}
                        day={day}
                        isWeekend={isWeekend}
                        isToday={isToday}
                        eventsOnDay={eventsOnDay}
                        isHighlighted={isHighlighted(monthIndex, day)}
                        dragPreviewEvent={showPreview ? dragPreviewEvent : null}
                        activeEventId={activeEventId}
                        currentColors={currentColors}
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
