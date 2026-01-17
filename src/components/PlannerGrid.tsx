import React, { useRef, useEffect } from 'react';
import { DndContext, DragEndEvent, DragStartEvent, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { usePlanner } from '../context/PlannerContext';
import MonthColumn from './MonthColumn';
import { daysOfWeek, getThemeColors, PlannerEvent, EventRange, toDateStr, toLocalDate } from '../utils/calendarUtils';

interface PlannerGridProps {
    weekdayAlign: boolean;
    onEventClick: (e: React.MouseEvent, allEventsOnDay: PlannerEvent[], m: number, d: number) => void;
    setTodayInView: (inView: boolean) => void;
    onRangeSelection: (range: EventRange) => void;
}

const PlannerGrid: React.FC<PlannerGridProps> = ({ weekdayAlign, onEventClick, setTodayInView, onRangeSelection }) => {
    const {
        year, monthsToShow, events, theme, highlightToday, showWeekends,
        startDrag, updateDrag, isHighlighted, onTouchStart, onTouchMove, onTouchEnd,
        setEvents
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

    // Dnd Sensors
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(TouchSensor, {
            activationConstraint: {
                delay: 250,
                tolerance: 5,
            },
        })
    );

    // State to suppress click after drag
    const isDragJustFinishedRef = useRef(false);
    const [dragPreviewEvent, setDragPreviewEvent] = React.useState<PlannerEvent | null>(null);
    const [activeEventId, setActiveEventId] = React.useState<string | null>(null);

    const handleDragStart = (event: DragStartEvent) => {
        isDragJustFinishedRef.current = false;
        const activeData = event.active.data.current as any;
        if (activeData?.event) {
            setActiveEventId(activeData.event.id);
        }
    };

    // Calculate potentially new event position
    const calculateNewEvent = (active: any, over: any) => {
        const overId = over.id as string;
        const parts = overId.split('-');
        if (parts.length < 4) return null;

        const targetYear = parseInt(parts[1]);
        const targetMonth = parseInt(parts[2]);
        const targetDay = parseInt(parts[3]);

        // Get Drag Source Date from active.data.current
        const activeData = active.data.current as any;
        if (!activeData || !activeData.current) return null;

        const { day: sourceDay, month: sourceMonth, year: sourceYear } = activeData.current;

        // UTC Calc to avoid DST shifts
        const utcTarget = Date.UTC(targetYear, targetMonth, targetDay);
        const utcSource = Date.UTC(sourceYear, sourceMonth, sourceDay);
        const msPerDay = 1000 * 60 * 60 * 24;
        const dayDiff = Math.round((utcTarget - utcSource) / msPerDay);

        if (dayDiff === 0) return null;

        const eventId = activeData.event.id;
        const eventToMove = events.find(e => e.id === eventId);
        if (!eventToMove) return null;

        const s = toLocalDate(eventToMove.start);
        const e = toLocalDate(eventToMove.end);

        s.setDate(s.getDate() + dayDiff);
        e.setDate(e.getDate() + dayDiff);

        return {
            ...eventToMove,
            start: toDateStr(s.getFullYear(), s.getMonth(), s.getDate()),
            end: toDateStr(e.getFullYear(), e.getMonth(), e.getDate())
        };
    };

    const handleDragOver = (event: any) => {
        const { active, over } = event;
        if (!over) {
            setDragPreviewEvent(null);
            return;
        }
        const preview = calculateNewEvent(active, over);
        setDragPreviewEvent(preview);
    };

    const handleDragCancel = () => {
        setDragPreviewEvent(null);
        setActiveEventId(null);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        setDragPreviewEvent(null);
        setTimeout(() => {
            isDragJustFinishedRef.current = false;
        }, 100);

        const { active, over } = event;
        if (!over) return;

        // Mark drag as finished to prevent click
        isDragJustFinishedRef.current = true;
        setActiveEventId(null);

        const newEvent = calculateNewEvent(active, over);
        if (newEvent) {
            const newEvents = events.map(ev => (ev.id === newEvent.id ? newEvent : ev));
            setEvents(newEvents);
        }
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

    const handleEventClickWrapped = (e: React.MouseEvent, allEventsOnDay: PlannerEvent[], m: number, d: number) => {
        if (e.button !== 0) return; // Ignore right clicks
        if (isDragJustFinishedRef.current) {
            e.stopPropagation();
            return;
        }
        onEventClick(e, allEventsOnDay, m, d);
    };

    return (
        <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
        >
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
                            dragPreviewEvent={dragPreviewEvent}
                            activeEventId={activeEventId}
                            currentColors={currentColors}
                            onMouseDown={startDrag}
                            onMouseEnter={updateDrag}
                            isHighlighted={isHighlighted}
                            onEventClick={handleEventClickWrapped}
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
        </DndContext>
    );
};

export default PlannerGrid;
