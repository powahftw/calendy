import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { RangeDate, EventRange } from '../utils/calendarUtils';
import { isTouchDevice, MouseSelectionStrategy, SelectionStrategy, TouchSelectionStrategy } from '../utils/selectionStrategies';

const TOUCH_MOVE_THRESHOLD = 10;

const useDragSelection = (year: number) => {
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState<RangeDate | null>(null);
    const [dragCurrent, setDragCurrent] = useState<RangeDate | null>(null);

    // Mobile / Touch State
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

    const startDrag = useCallback((m: number, d: number) => {
        setIsDragging(true);
        setDragStart({ year, month: m, day: d });
        setDragCurrent({ year, month: m, day: d });
    }, [year]);

    const updateDrag = useCallback((m: number, d: number) => {
        if (isDragging) {
            setDragCurrent({ year, month: m, day: d });
        }
    }, [isDragging, year]);

    const finaliseDrag = useCallback((callback: (range: EventRange) => void) => {
        if (dragStart && dragCurrent) {
            const d1 = new Date(year, dragStart.month, dragStart.day);
            const d2 = new Date(year, dragCurrent.month, dragCurrent.day);

            let start: RangeDate, end: RangeDate;
            if (d1.getTime() <= d2.getTime()) {
                start = { year, month: dragStart.month, day: dragStart.day };
                end = { year, month: dragCurrent.month, day: dragCurrent.day };
            } else {
                start = { year, month: dragCurrent.month, day: dragCurrent.day };
                end = { year, month: dragStart.month, day: dragStart.day };
            }
            callback({ start, end });
        }
        setDragStart(null);
        setDragCurrent(null);
    }, [dragStart, dragCurrent, year]);

    const endDrag = useCallback((callback: (range: EventRange) => void) => {
        if (!isDragging) return;
        setIsDragging(false);
        finaliseDrag(callback);
    }, [finaliseDrag, isDragging]);

    // --- Touch Handlers ---
    const getCellFromPoint = useCallback((x: number, y: number): RangeDate | null => {
        const el = document.elementFromPoint(x, y);
        if (!el) return null;

        // Use closest in case we hit an event chip or child
        const cell = el.closest('.day-cell') as HTMLElement;
        if (cell && cell.dataset.month && cell.dataset.day) {
            return {
                year,
                month: parseInt(cell.dataset.month),
                day: parseInt(cell.dataset.day)
            };
        }
        return null;
    }, [year]);

    const isHighlighted = (m: number, d: number) => {
        if ((!isDragging && !selectionMode) || !dragStart || !dragCurrent) return false;
        const startVal = dragStart.month * 100 + dragStart.day;
        const currVal = dragCurrent.month * 100 + dragCurrent.day;
        const minVal = Math.min(startVal, currVal);
        const maxVal = Math.max(startVal, currVal);
        const val = m * 100 + d;
        return val >= minVal && val <= maxVal;
    };

    const selectionStrategy: SelectionStrategy = useMemo(() => {
        if (isTouchDevice()) {
            return new TouchSelectionStrategy({
                year,
                getState: () => stateRef.current,
                setIsDragging,
                setSelectionMode,
                setDragStart,
                setDragCurrent,
                finaliseDrag,
                getCellFromPoint,
                touchMoveThreshold: TOUCH_MOVE_THRESHOLD
            });
        }

        return new MouseSelectionStrategy({
            start: startDrag,
            update: updateDrag,
            end: endDrag
        });
    }, [endDrag, finaliseDrag, getCellFromPoint, startDrag, updateDrag, year]);

    useEffect(() => () => selectionStrategy.cleanup?.(), [selectionStrategy]);

    const handleTouchStart = selectionStrategy.onTouchStart ?? (() => { });
    const handleTouchMove = selectionStrategy.onTouchMove ?? (() => { });
    const handleTouchEnd = selectionStrategy.onTouchEnd ?? ((callback: (range: EventRange) => void) => selectionStrategy.end(callback));
    const handleContextMenu = selectionStrategy.onContextMenu ?? ((e: React.MouseEvent) => {
        if (selectionMode || isDragging) {
            e.preventDefault();
        }
    });

    return {
        isDragging: isDragging || selectionMode,
        dragStart,
        dragCurrent,
        selectionMode,
        startDrag: selectionStrategy.start,
        updateDrag: selectionStrategy.update,
        endDrag: selectionStrategy.end,
        isHighlighted,
        onTouchStart: handleTouchStart,
        onTouchMove: handleTouchMove,
        onTouchEnd: handleTouchEnd,
        onContextMenu: handleContextMenu
    };
};

export default useDragSelection;
