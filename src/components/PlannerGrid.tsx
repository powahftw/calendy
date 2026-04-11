import React, { useRef, useMemo } from 'react';
import { DndContext, DragEndEvent, DragStartEvent, DragOverEvent, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { usePlannerMeta } from '../context/PlannerMetaContext';
import { usePlannerEvents } from '../context/PlannerEventsContext';
import { usePlannerInteraction } from '../context/PlannerInteractionContext';
import MonthColumn from './MonthColumn';
import { daysOfWeek, PlannerEvent, EventRange } from '../utils/calendarUtils';
import { DragDataPayload, useEventDragCalculations } from '../hooks/useEventDragCalculations';
import { useTodayVisibility } from '../hooks/useTodayVisibility';
import { logger } from '../utils/logger';
import useDragSelection from '../hooks/useDragSelection';


interface PlannerGridProps {
    onEventClick: (e: React.MouseEvent, allEventsOnDay: PlannerEvent[], y: number, m: number, d: number) => void;
    setTodayInView: (inView: boolean) => void;
    onRangeSelection: (range: EventRange) => void;
}

const PlannerGrid: React.FC<PlannerGridProps> = ({ onEventClick, setTodayInView, onRangeSelection }) => {
    const { year, startMonth, monthsToShow, weekdayAlign, highlightToday } = usePlannerMeta();
    const { events, setEvents } = usePlannerEvents();
    const { setActiveEventId } = usePlannerInteraction();

    const {
        startDrag,
        updateDrag,
        endDrag: endSelectionDrag,
        isHighlighted,
        onTouchStart,
        onTouchEnd: onTouchEndSelection,
        onTouchMove
    } = useDragSelection();

    const { calculateNewEventPosition } = useEventDragCalculations(events);

    const MAX_MONTH_ROWS = 37; // 31 days plus up to 6 weekday-alignment spacer rows.
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

    const handleTouchEndWrapped = () => {
        onTouchEndSelection(onRangeSelection);
    };

    const handleMouseUpWrapped = () => {
        endSelectionDrag(onRangeSelection);
    };

    const sensors = useSensors(
        useSensor(MouseSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(TouchSensor, {
            activationConstraint: {
                delay: 300,
                tolerance: 5,
            },
        })
    );

    const isDragJustFinishedRef = useRef(false);
    const [dragPreviewEvent, setDragPreviewEvent] = React.useState<PlannerEvent | null>(null);

    const handleDragStart = (event: DragStartEvent) => {
        isDragJustFinishedRef.current = false;
        const activeData = event.active.data.current as DragDataPayload | undefined;
        if (activeData?.event) {
            logger.info('Drag started for event:', activeData.event);
            setActiveEventId(activeData.event.id);
        }
    };

    const handleDragOver = (event: DragOverEvent) => {
        const { active, over } = event;
        if (!over) {
            setDragPreviewEvent(null);
            return;
        }
        const preview = calculateNewEventPosition(active, over);
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
        if (!over) {
            logger.info('Drag ended (cancelled/no target)');
            return;
        }

        // Mark drag as finished to prevent click
        isDragJustFinishedRef.current = true;
        setActiveEventId(null);

        const newEvent = calculateNewEventPosition(active, over);
        if (newEvent) {
            logger.info('Drag finished, moving event to:', newEvent);
            const newEvents = events.map(ev => (ev.id === newEvent.id ? newEvent : ev));
            setEvents(newEvents);
        }
    };

    const handleEventClickWrapped = (e: React.MouseEvent, allEventsOnDay: PlannerEvent[], y: number, m: number, d: number) => {
        if (e.button !== 0) return; // Ignore right clicks
        if (isDragJustFinishedRef.current) {
            e.stopPropagation();
            return;
        }
        onEventClick(e, allEventsOnDay, y, m, d);
    };

    const monthsArray = useMemo(() => Array.from({ length: monthsToShow }), [monthsToShow]);

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
                                colYear={colYear}
                                colMonth={colMonth}
                                dragPreviewEvent={dragPreviewEvent}
                                onEventClick={handleEventClickWrapped}
                                maxRows={MAX_MONTH_ROWS}
                                today={todayData}
                                startDrag={startDrag}
                                updateDrag={updateDrag}
                                isHighlighted={isHighlighted}
                                onTouchStart={onTouchStart}
                                onTouchMove={onTouchMove}
                                onTouchEnd={handleTouchEndWrapped}
                                onMouseUp={handleMouseUpWrapped}
                            />
                        );
                    })}
                </div>
            </div>
        </DndContext>
    );
};

export default PlannerGrid;
