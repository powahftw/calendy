import { useState, useRef, useEffect } from 'react';
import { RangeDate, EventRange } from '../utils/calendarUtils';

const TOUCH_MOVE_THRESHOLD = 10;

const useDragSelection = (year: number) => {
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState<RangeDate | null>(null);
    const [dragCurrent, setDragCurrent] = useState<RangeDate | null>(null);

    // Mobile / Touch State
    const [selectionMode, setSelectionMode] = useState(false);
    const longPressTimer = useRef<NodeJS.Timeout | null>(null);
    const touchStartPos = useRef<{ x: number, y: number } | null>(null);

    const startDrag = (m: number, d: number) => {
        setIsDragging(true);
        setDragStart({ year, month: m, day: d });
        setDragCurrent({ year, month: m, day: d });
    };

    const updateDrag = (m: number, d: number) => {
        if (isDragging) {
            setDragCurrent({ year, month: m, day: d });
        }
    };

    const finaliseDrag = (callback: (range: EventRange) => void) => {
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
    };

    const endDrag = (callback: (range: EventRange) => void) => {
        if (!isDragging) return;
        setIsDragging(false);
        finaliseDrag(callback);
    };

    // --- Touch Handlers ---
    const getCellFromPoint = (x: number, y: number): RangeDate | null => {
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
    };

    const onTouchStart = (e: React.TouchEvent, m: number, d: number) => {
        touchStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };

        longPressTimer.current = setTimeout(() => {
            setSelectionMode(true);
            setIsDragging(true); // Reuse drag logic state
            setDragStart({ year, month: m, day: d });
            setDragCurrent({ year, month: m, day: d });
            // Haptic feedback if available
            if (navigator.vibrate) navigator.vibrate(50);
        }, 500);
    };

    const onTouchMove = (e: React.TouchEvent) => {
        if (selectionMode) {
            // Prevent scrolling
            if (e.cancelable) e.preventDefault();

            const touch = e.touches[0];
            const cellDate = getCellFromPoint(touch.clientX, touch.clientY);

            if (cellDate) {
                setDragCurrent(cellDate);
            }
        } else {
            // Check if moved enough to cancel long press
            if (touchStartPos.current) {
                const dx = e.touches[0].clientX - touchStartPos.current.x;
                const dy = e.touches[0].clientY - touchStartPos.current.y;
                if (Math.abs(dx) > TOUCH_MOVE_THRESHOLD || Math.abs(dy) > TOUCH_MOVE_THRESHOLD) {
                    if (longPressTimer.current) clearTimeout(longPressTimer.current);
                }
            }
        }
    };

    const onTouchEnd = (callback: (range: EventRange) => void) => {
        if (longPressTimer.current) clearTimeout(longPressTimer.current);

        if (selectionMode) {
            setIsDragging(false);
            setSelectionMode(false);
            finaliseDrag(callback);
        }
        touchStartPos.current = null;
    };

    const onContextMenu = (e: React.MouseEvent) => {
        // Prevent system menu if we are in selection mode or just finished it
        if (selectionMode || isDragging) {
            e.preventDefault();
        }
    };

    const isHighlighted = (m: number, d: number) => {
        if ((!isDragging && !selectionMode) || !dragStart || !dragCurrent) return false;
        const startVal = dragStart.month * 100 + dragStart.day;
        const currVal = dragCurrent.month * 100 + dragCurrent.day;
        const minVal = Math.min(startVal, currVal);
        const maxVal = Math.max(startVal, currVal);
        const val = m * 100 + d;
        return val >= minVal && val <= maxVal;
    };

    // Cleanup
    useEffect(() => {
        return () => {
            if (longPressTimer.current) clearTimeout(longPressTimer.current);
        };
    }, []);

    return {
        isDragging: isDragging || selectionMode,
        dragStart,
        dragCurrent,
        selectionMode,
        startDrag,
        updateDrag,
        endDrag,
        isHighlighted,
        onTouchStart,
        onTouchMove,
        onTouchEnd,
        onContextMenu
    };
};

export default useDragSelection;
