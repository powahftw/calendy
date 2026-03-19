import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { RangeDate, EventRange } from '../utils/calendarUtils';
import { MouseSelectionStrategy, TouchSelectionStrategy } from '../utils/selectionStrategies';

const TOUCH_MOVE_THRESHOLD = 10;

const useDragSelection = () => {
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState<RangeDate | null>(null);
    const [dragCurrent, setDragCurrent] = useState<RangeDate | null>(null);
    const [selectionMode, setSelectionMode] = useState(false);
    const stateRef = useRef({
        isDragging: false,
        selectionMode: false,
        dragStart: null as RangeDate | null,
        dragCurrent: null as RangeDate | null
    });

    useEffect(() => {
        stateRef.current = { isDragging, selectionMode, dragStart, dragCurrent };
    }, [isDragging, selectionMode, dragStart, dragCurrent]);

    const startDrag = useCallback((y: number, m: number, d: number) => {
        setIsDragging(true);
        setDragStart({ year: y, month: m, day: d });
        setDragCurrent({ year: y, month: m, day: d });
        stateRef.current.isDragging = true;
        stateRef.current.dragStart = { year: y, month: m, day: d };
        stateRef.current.dragCurrent = { year: y, month: m, day: d };
    }, []);

    const updateDrag = useCallback((y: number, m: number, d: number) => {
        if (stateRef.current.isDragging) {
            setDragCurrent({ year: y, month: m, day: d });
            stateRef.current.dragCurrent = { year: y, month: m, day: d };
        }
    }, []);

    const finaliseDrag = useCallback((callback: (range: EventRange) => void) => {
        const { dragStart, dragCurrent } = stateRef.current;
        if (dragStart && dragCurrent) {
            const d1 = new Date(dragStart.year, dragStart.month, dragStart.day);
            const d2 = new Date(dragCurrent.year, dragCurrent.month, dragCurrent.day);

            let start: RangeDate, end: RangeDate;
            if (d1.getTime() <= d2.getTime()) {
                start = { ...dragStart };
                end = { ...dragCurrent };
            } else {
                start = { ...dragCurrent };
                end = { ...dragStart };
            }
            callback({ start, end });
        }
        setDragStart(null);
        setDragCurrent(null);
        stateRef.current.dragStart = null;
        stateRef.current.dragCurrent = null;
    }, []);

    const endDrag = useCallback((callback: (range: EventRange) => void) => {
        if (!stateRef.current.isDragging) return;
        setIsDragging(false);
        stateRef.current.isDragging = false;
        finaliseDrag(callback);
    }, [finaliseDrag]);

    const getCellFromPoint = useCallback((x: number, y: number): RangeDate | null => {
        const el = document.elementFromPoint(x, y);
        if (!el) return null;

        // Use closest in case we hit an event chip or child
        const cell = el.closest('.day-cell') as HTMLElement;
        if (cell && cell.dataset.year && cell.dataset.month && cell.dataset.day) {
            return {
                year: parseInt(cell.dataset.year),
                month: parseInt(cell.dataset.month),
                day: parseInt(cell.dataset.day)
            };
        }
        return null;
    }, []);

    const isHighlighted = (y: number, m: number, d: number) => {
        if ((!isDragging && !selectionMode) || !dragStart || !dragCurrent) return false;

        const startVal = dragStart.year * 10000 + dragStart.month * 100 + dragStart.day;
        const currVal = dragCurrent.year * 10000 + dragCurrent.month * 100 + dragCurrent.day;
        const targetVal = y * 10000 + m * 100 + d;

        const minVal = Math.min(startVal, currVal);
        const maxVal = Math.max(startVal, currVal);

        return targetVal >= minVal && targetVal <= maxVal;
    };

    const mouseStrategy = useMemo(() => new MouseSelectionStrategy({
        start: startDrag,
        update: updateDrag,
        end: endDrag
    }), [startDrag, updateDrag, endDrag]);

    const touchStrategy = useMemo(() => new TouchSelectionStrategy({
        getState: () => stateRef.current,
        setIsDragging,
        setSelectionMode,
        setDragStart,
        setDragCurrent,
        finaliseDrag,
        getCellFromPoint,
        touchMoveThreshold: TOUCH_MOVE_THRESHOLD
    }), [finaliseDrag, getCellFromPoint]);

    useEffect(() => () => touchStrategy.cleanup?.(), [touchStrategy]);

    const handleTouchStart = touchStrategy.onTouchStart ?? (() => { });
    const handleTouchMove = touchStrategy.onTouchMove ?? (() => { });
    const handleTouchEnd = touchStrategy.onTouchEnd ?? ((callback: (range: EventRange) => void) => touchStrategy.end(callback));
    const handleContextMenu = touchStrategy.onContextMenu ?? ((e: React.MouseEvent) => {
        if (selectionMode || isDragging) {
            e.preventDefault();
        }
    });

    return {
        isDragging: isDragging || selectionMode,
        dragStart,
        dragCurrent,
        selectionMode,
        startDrag: mouseStrategy.start,
        updateDrag: mouseStrategy.update,
        endDrag: mouseStrategy.end,
        isHighlighted,
        onTouchStart: handleTouchStart,
        onTouchMove: handleTouchMove,
        onTouchEnd: handleTouchEnd,
        onContextMenu: handleContextMenu
    };
};

export default useDragSelection;
