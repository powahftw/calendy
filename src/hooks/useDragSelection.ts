import { useState } from 'react';
import { RangeDate, EventRange } from '../utils/calendarUtils';

const useDragSelection = (year: number) => {
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState<RangeDate | null>(null);
    const [dragCurrent, setDragCurrent] = useState<RangeDate | null>(null);

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

    const endDrag = (callback: (range: EventRange) => void) => {
        if (!isDragging) return;
        setIsDragging(false);

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

    const isHighlighted = (m: number, d: number) => {
        if (!isDragging || !dragStart || !dragCurrent) return false;
        const startVal = dragStart.month * 100 + dragStart.day;
        const currVal = dragCurrent.month * 100 + dragCurrent.day;
        const minVal = Math.min(startVal, currVal);
        const maxVal = Math.max(startVal, currVal);
        const val = m * 100 + d;
        return val >= minVal && val <= maxVal;
    };

    return {
        isDragging,
        startDrag,
        updateDrag,
        endDrag,
        isHighlighted
    };
};

export default useDragSelection;
