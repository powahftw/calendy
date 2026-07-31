import React, { FC, useMemo } from 'react';
import { monthNames, getDayOfWeekIndex, getDateKey } from '../utils/calendarUtils';
import { usePlannerMeta } from '../context/PlannerMetaContext';
import { usePlannerEvents } from '../context/PlannerEventsContext';
import { usePlannerInteraction } from '../context/PlannerInteractionContext';
import { generateMonthLayout } from '../utils/calendar/layoutCalculations';
import type { DayEvents } from '../utils/calendarEvents';
import DayCell from './calendar/DayCell';

const EMPTY_DAY_EVENTS: DayEvents = { allDay: [], pill: [] };

interface MonthColumnProps {
    /** Visual column index, used to decide which way pill popovers open. */
    monthIndex: number;
    monthsToShow: number;
    colYear: number;
    colMonth: number;
    maxRows: number;
    today: {
        todayYear: number;
        todayMonth: number;
        todayDay: number;
    };
}

const MonthColumn: FC<MonthColumnProps> = ({
    monthIndex,
    monthsToShow,
    colYear,
    colMonth,
    maxRows,
    today
}) => {
    const { weekdayAlign, showWeekends, highlightToday } = usePlannerMeta();
    const { eventMap } = usePlannerEvents();
    const { openPillDayKey, setOpenPillDayKey } = usePlannerInteraction();

    const layout = useMemo(() => generateMonthLayout({
        year: colYear,
        monthIndex: colMonth,
        weekdayAlign,
        maxRows
    }), [colYear, colMonth, weekdayAlign, maxRows]);

    // Popovers open to the left by default; columns in the left half of the
    // grid would push them off screen, so those flip to the right.
    const flipPopover = monthIndex < monthsToShow / 2;

    return (
        <div className="month-col">
            <div className="month-header unselectable">{monthNames[colMonth]}</div>

            {layout.map((cell) => {
                if (cell.type === 'spacer' || cell.type === 'filler') {
                    return <DayCell key={cell.id} type={cell.type} />;
                }

                const day = cell.day!;
                const dateKey = getDateKey(colYear, colMonth, day);
                const dayEvents = eventMap.get(dateKey) ?? EMPTY_DAY_EVENTS;

                const dayIdx = getDayOfWeekIndex(colYear, colMonth, day);
                const isWeekend = dayIdx === 5 || dayIdx === 6;
                const isToday = highlightToday
                    && colYear === today.todayYear
                    && colMonth === today.todayMonth
                    && day === today.todayDay;

                return (
                    <DayCell
                        key={cell.id}
                        type="day"
                        dayKey={dateKey}
                        date={{ year: colYear, month: colMonth, day }}
                        events={dayEvents}
                        appearance={{ isWeekend, showWeekends, isToday, flipPopover }}
                        pill={{
                            isOpen: openPillDayKey === dateKey,
                            onOpenChange: (open) => setOpenPillDayKey(open ? dateKey : null)
                        }}
                    />
                );
            })}
        </div>
    );
};

export default MonthColumn;
