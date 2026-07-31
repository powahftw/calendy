import React, { useRef, useMemo } from 'react';
import { usePlannerMeta } from '../context/PlannerMetaContext';
import { usePlannerEvents } from '../context/PlannerEventsContext';
import MonthColumn from './MonthColumn';
import { daysOfWeek } from '../utils/calendarUtils';
import { useTodayVisibility } from '../hooks/useTodayVisibility';

interface PlannerGridProps {
    setTodayInView: (inView: boolean) => void;
}

const MAX_MONTH_ROWS = 37; // 31 days plus up to 6 weekday-alignment spacer rows.

const PlannerGrid: React.FC<PlannerGridProps> = ({ setTodayInView }) => {
    const { year, startMonth, monthsToShow, weekdayAlign, highlightToday } = usePlannerMeta();
    const { events } = usePlannerEvents();

    const todayObj = new Date();
    const todayData = {
        todayYear: todayObj.getFullYear(),
        todayMonth: todayObj.getMonth(),
        todayDay: todayObj.getDate()
    };

    const scrollAreaRef = useRef<HTMLDivElement>(null);

    useTodayVisibility(scrollAreaRef, setTodayInView, {
        year,
        startMonth,
        monthsToShow,
        highlightToday,
        eventCount: events.length
    });

    const monthsArray = useMemo(() => Array.from({ length: monthsToShow }), [monthsToShow]);

    return (
        <div className="planner-scroll-area" ref={scrollAreaRef}>
            <div className="planner-grid">
                {weekdayAlign && (
                    <div className="legend-col">
                        <div className="month-header unselectable"></div>
                        {Array.from({ length: MAX_MONTH_ROWS }).map((_, i) => (
                            <div key={i} className="day-cell legend-cell">
                                {daysOfWeek[i % 7]}
                            </div>
                        ))}
                    </div>
                )}

                {monthsArray.map((_, monthIndex) => {
                    const colYear = year + Math.floor((startMonth + monthIndex) / 12);
                    const colMonth = (startMonth + monthIndex) % 12;

                    return (
                        <MonthColumn
                            key={monthIndex}
                            monthIndex={monthIndex}
                            monthsToShow={monthsToShow}
                            colYear={colYear}
                            colMonth={colMonth}
                            maxRows={MAX_MONTH_ROWS}
                            today={todayData}
                        />
                    );
                })}
            </div>
        </div>
    );
};

export default PlannerGrid;
