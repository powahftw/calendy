import React, { useRef, useMemo } from 'react';
import { DndContext, DragEndEvent, DragStartEvent, DragOverEvent, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { usePlannerMeta } from '../context/PlannerMetaContext';
import { usePlannerEvents } from '../context/PlannerEventsContext';
import { usePlannerInteraction } from '../context/PlannerInteractionContext';
import MonthColumn from './MonthColumn';
import { daysOfWeek, PlannerEvent, EventRange } from '../utils/calendarUtils';
import { useEventDragCalculations } from '../hooks/useEventDragCalculations';
import { useTodayVisibility } from '../hooks/useTodayVisibility';
import { logger } from '../utils/logger';
import useDragSelection from '../hooks/useDragSelection';


interface PlannerGridProps {
    onEventClick: (e: React.MouseEvent, allEventsOnDay: PlannerEvent[], m: number, d: number) => void;
    setTodayInView: (inView: boolean) => void;
    onRangeSelection: (range: EventRange) => void;
}

const PlannerGrid: React.FC<PlannerGridProps> = ({ onEventClick, setTodayInView, onRangeSelection }) => {
    const { year, monthsToShow, weekdayAlign, highlightToday } = usePlannerMeta();
    const { events, setEvents } = usePlannerEvents();
    const { setActiveEventId } = usePlannerInteraction();

    // Local drag state
    const {
        startDrag,
        updateDrag,
        endDrag: endSelectionDrag,
        isHighlighted,
        onTouchStart,
        onTouchEnd: onTouchEndSelection,
        onTouchMove
    } = useDragSelection(year);

    const { calculateNewEventPosition } = useEventDragCalculations(events);

    const maxRows = 37;
    const todayObj = new Date();
    const todayData = {
        todayYear: todayObj.getFullYear(),
        todayMonth: todayObj.getMonth(),
        todayDay: todayObj.getDate()
    };

    const scrollAreaRef = useRef<HTMLDivElement>(null);

    useTodayVisibility(scrollAreaRef, setTodayInView, [year, monthsToShow, highlightToday, events]);

    const handleTouchEndWrapped = () => {
        onTouchEndSelection(onRangeSelection);
    };

    const handleMouseUpWrapped = () => {
        endSelectionDrag(onRangeSelection);
    };

    // Dnd Sensors
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

    // State to suppress click after drag
    const isDragJustFinishedRef = useRef(false);
    const [dragPreviewEvent, setDragPreviewEvent] = React.useState<PlannerEvent | null>(null);

    const handleDragStart = (event: DragStartEvent) => {
        isDragJustFinishedRef.current = false;
        const activeData = event.active.data.current as any;
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

    const handleEventClickWrapped = (e: React.MouseEvent, allEventsOnDay: PlannerEvent[], m: number, d: number) => {
        if (e.button !== 0) return; // Ignore right clicks
        if (isDragJustFinishedRef.current) {
            e.stopPropagation();
            return;
        }
        onEventClick(e, allEventsOnDay, m, d);
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
                            {Array.from({ length: maxRows }).map((_, i) => (
                                <div key={i} className="day-cell legend-cell">
                                    {daysOfWeek[i % 7]}
                                </div>
                            ))}
                        </div>
                    )}

                    {monthsArray.map((_, monthIndex) => (
                        <MonthColumn
                            key={monthIndex}
                            monthIndex={monthIndex}
                            dragPreviewEvent={dragPreviewEvent}
                            onEventClick={handleEventClickWrapped}
                            maxRows={maxRows}
                            today={todayData}

                            // Drag props
                            startDrag={startDrag}
                            updateDrag={updateDrag}
                            isHighlighted={isHighlighted}
                            onTouchStart={onTouchStart}
                            onTouchMove={onTouchMove}
                            onTouchEnd={handleTouchEndWrapped}
                            onMouseUp={handleMouseUpWrapped}
                        />
                    ))}
                </div>
            </div>
        </DndContext>
    );
};

export default PlannerGrid;
