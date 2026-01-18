import { useCallback } from 'react';
import { PlannerEvent, toLocalDate, toDateStr } from '../utils/calendarUtils';
import { Active, Over } from '@dnd-kit/core';

interface DragDataPayload {
    event: PlannerEvent;
    current: { day: number; month: number; year: number };
}

interface DropTargetData {
    year: number;
    month: number;
    day: number;
}

export function useEventDragCalculations(events: PlannerEvent[]) {
    const calculateNewEventPosition = useCallback((
        active: Active,
        over: Over
    ): PlannerEvent | null => {
        const activeData = active.data.current as DragDataPayload;
        const overData = over.data.current as DropTargetData;

        if (!activeData || !overData) return null;

        const { event, current: source } = activeData;
        const target = overData;

        // UTC to avoid DST issues
        const utcTarget = Date.UTC(target.year, target.month, target.day);
        const utcSource = Date.UTC(source.year, source.month, source.day);
        const dayDiff = Math.round((utcTarget - utcSource) / (1000 * 60 * 60 * 24));

        if (dayDiff === 0) return null;

        const eventToMove = events.find(e => e.id === event.id);
        if (!eventToMove) return null;

        const startDate = toLocalDate(eventToMove.start);
        const endDate = toLocalDate(eventToMove.end);

        startDate.setDate(startDate.getDate() + dayDiff);
        endDate.setDate(endDate.getDate() + dayDiff);

        return {
            ...eventToMove,
            start: toDateStr(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()),
            end: toDateStr(endDate.getFullYear(), endDate.getMonth(), endDate.getDate())
        };
    }, [events]);

    return { calculateNewEventPosition };
}
