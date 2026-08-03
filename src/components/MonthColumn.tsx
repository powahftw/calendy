import React, { FC, useMemo } from 'react';
import { monthNames, getDayOfWeekIndex, getDateKey } from '../utils/calendarUtils';
import { usePlanner } from '../context/PlannerContext';
import { useTheme } from '../hooks/useTheme';
import { generateMonthLayout } from '../utils/calendar/layoutCalculations';
import type { DayEvents } from '../utils/calendarEvents';
import DayCell from './calendar/DayCell';

const EMPTY_DAY_EVENTS: DayEvents = { allDay: [], pill: [] };

interface MonthColumnProps {
    /** Visual column index, used to decide which way pill popovers open. */
    monthIndex: number;
    monthsToShow: number;
    year: number;
    month: number;
    rows: number;
    today: string;
}

const MonthColumn: FC<MonthColumnProps> = ({ monthIndex, monthsToShow, year, month, rows, today }) => {
    const { weekdayAlign, showWeekends, highlightToday, eventMap } = usePlanner();
    const colors = useTheme();

    const layout = useMemo(
        () => generateMonthLayout(year, month, weekdayAlign, rows),
        [year, month, weekdayAlign, rows]
    );

    // Popovers open to the left by default; columns in the left half of the
    // grid would push them off screen, so those flip to the right.
    const flipPopover = monthIndex < monthsToShow / 2;

    return (
        <div className="month-col">
            <div className="month-header unselectable">{monthNames[month]}</div>

            {layout.map((day, row) => {
                if (day === null) return <div key={row} className="day-cell empty" />;

                const dayKey = getDateKey(year, month, day);
                const weekday = getDayOfWeekIndex(year, month, day);

                return (
                    <DayCell
                        key={row}
                        dayKey={dayKey}
                        year={year}
                        month={month}
                        day={day}
                        events={eventMap.get(dayKey) ?? EMPTY_DAY_EVENTS}
                        colors={colors}
                        isWeekend={showWeekends && (weekday === 5 || weekday === 6)}
                        isToday={highlightToday && dayKey === today}
                        flipPopover={flipPopover}
                    />
                );
            })}
        </div>
    );
};

export default MonthColumn;
