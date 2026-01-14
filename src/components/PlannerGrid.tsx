import React, { useRef, useEffect } from 'react';
import { usePlanner } from '../context/PlannerContext';
import MonthColumn from './MonthColumn';
import { daysOfWeek, getThemeColors, PlannerEvent, EventRange } from '../utils/calendarUtils';

interface PlannerGridProps {
    weekdayAlign: boolean;
    onEventClick: (e: React.MouseEvent, allEventsOnDay: PlannerEvent[], m: number, d: number) => void;
    setTodayInView: (inView: boolean) => void;
    onRangeSelection: (range: EventRange) => void;
}

const PlannerGrid: React.FC<PlannerGridProps> = ({ weekdayAlign, onEventClick, setTodayInView, onRangeSelection }) => {
    const {
        year, monthsToShow, events, theme, highlightToday, showWeekends,
        startDrag, updateDrag, isHighlighted, onTouchStart, onTouchMove, onTouchEnd
    } = usePlanner();

    const currentColors = getThemeColors(theme);
    const maxRows = 37;
    const todayObj = new Date();
    const todayData = {
        todayYear: todayObj.getFullYear(),
        todayMonth: todayObj.getMonth(),
        todayDay: todayObj.getDate()
    };

    const scrollAreaRef = useRef<HTMLDivElement>(null);

    const handleTouchEndWrapped = () => {
        onTouchEnd(onRangeSelection);
    };

    // Today Visibility Logic moved here
    useEffect(() => {
        const scrollArea = scrollAreaRef.current;
        if (!scrollArea) return;

        const checkVisibility = () => {
            const todayEl = document.querySelector('.today-marker');
            if (!todayEl) {
                // If not found, we assume in view or irrelevant? 
                // Original logic: setTodayInView(true) to avoid ghost button
                setTodayInView(true);
                return;
            }

            const rect = todayEl.getBoundingClientRect();
            const containerRect = scrollArea.getBoundingClientRect();

            // Buffer for responsiveness
            const buffer = 5;

            const isInView = (
                rect.bottom > containerRect.top + buffer &&
                rect.top < containerRect.bottom - buffer &&
                rect.right > containerRect.left + buffer &&
                rect.left < containerRect.right - buffer
            );

            setTodayInView(isInView);
        };

        scrollArea.addEventListener('scroll', checkVisibility, { passive: true });
        window.addEventListener('resize', checkVisibility);

        // Check multiple times as the layout settles (vital for mobile/fonts)
        const timers = [100, 500, 1000, 2000].map(ms => setTimeout(checkVisibility, ms));

        return () => {
            scrollArea.removeEventListener('scroll', checkVisibility);
            window.removeEventListener('resize', checkVisibility);
            timers.forEach(clearTimeout);
        };
    }, [year, monthsToShow, highlightToday, events, setTodayInView]);

    return (
        <div className="planner-scroll-area" ref={scrollAreaRef}>
            <div className="planner-grid">
                {weekdayAlign && (
                    <div className="legend-col">
                        <div className="month-header unselectable"></div>
                        {Array.from({ length: maxRows }).map((_, i) => (
                            <div key={i} className="day-cell legend-cell">
                                {daysOfWeek[i % 7]}
                            </div>
                        ))}
                    </div>
                )}

                {Array.from({ length: monthsToShow }).map((_, monthIndex) => (
                    <MonthColumn
                        key={monthIndex}
                        year={year}
                        monthIndex={monthIndex}
                        events={events}
                        currentColors={currentColors}
                        onMouseDown={startDrag}
                        onMouseEnter={updateDrag}
                        isHighlighted={isHighlighted}
                        onEventClick={onEventClick}
                        weekdayAlign={weekdayAlign}
                        maxRows={maxRows}
                        today={todayData}
                        highlightToday={highlightToday}
                        showWeekends={showWeekends}
                        onTouchStart={onTouchStart}
                        onTouchMove={onTouchMove}
                        onTouchEnd={handleTouchEndWrapped}
                    />
                ))}
            </div>
        </div>
    );
};

export default PlannerGrid;
