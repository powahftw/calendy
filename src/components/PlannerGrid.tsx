import React, { useRef } from 'react';
import { usePlanner } from '../context/PlannerContext';
import MonthColumn from './MonthColumn';
import { daysOfWeek, getDateKey, getMonthYear } from '../utils/calendarUtils';
import { useTodayVisibility } from '../hooks/useTodayVisibility';

const MONTH_ROWS = 37; // 31 days plus up to 6 weekday-alignment blanks.

const PlannerGrid: React.FC<{ setTodayInView: (inView: boolean) => void }> = ({ setTodayInView }) => {
    const { year, startMonth, monthsToShow, weekdayAlign, highlightToday, events } = usePlanner();
    const scrollAreaRef = useRef<HTMLDivElement>(null);

    const now = new Date();
    const today = getDateKey(now.getFullYear(), now.getMonth(), now.getDate());

    useTodayVisibility(scrollAreaRef, setTodayInView, {
        year,
        startMonth,
        monthsToShow,
        highlightToday,
        eventCount: events.length
    });

    return (
        <div className="planner-scroll-area" ref={scrollAreaRef}>
            <div className="planner-grid">
                {weekdayAlign && (
                    <div className="legend-col">
                        <div className="month-header unselectable"></div>
                        {Array.from({ length: MONTH_ROWS }, (_, row) => (
                            <div key={row} className="day-cell legend-cell">
                                {daysOfWeek[row % 7]}
                            </div>
                        ))}
                    </div>
                )}

                {Array.from({ length: monthsToShow }, (_, monthIndex) => {
                    const { year: colYear, month } = getMonthYear(year, startMonth, monthIndex);

                    return (
                        <MonthColumn
                            key={monthIndex}
                            monthIndex={monthIndex}
                            monthsToShow={monthsToShow}
                            year={colYear}
                            month={month}
                            rows={MONTH_ROWS}
                            today={today}
                        />
                    );
                })}
            </div>
        </div>
    );
};

export default PlannerGrid;
