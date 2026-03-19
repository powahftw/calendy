import { EventRange, RangeDate } from './calendarUtils';

export interface SelectionStrategy {
    start: (y: number, m: number, d: number) => void;
    update: (y: number, m: number, d: number) => void;
    end: (callback: (range: EventRange) => void) => void;
    onTouchStart?: (e: React.TouchEvent, y: number, m: number, d: number) => void;
    onTouchMove?: (e: React.TouchEvent) => void;
    onTouchEnd?: (callback: (range: EventRange) => void) => void;
    onContextMenu?: (e: React.MouseEvent) => void;
    cleanup?: () => void;
}

export const isTouchDevice = () =>
    typeof window !== 'undefined' &&
    ('ontouchstart' in window || navigator.maxTouchPoints > 0);

interface TouchStrategyOptions {
    getState: () => { isDragging: boolean; selectionMode: boolean; dragStart: RangeDate | null; dragCurrent: RangeDate | null };
    setIsDragging: (value: boolean) => void;
    setSelectionMode: (value: boolean) => void;
    setDragStart: (value: RangeDate | null) => void;
    setDragCurrent: (value: RangeDate | null) => void;
    finaliseDrag: (callback: (range: EventRange) => void) => void;
    getCellFromPoint: (x: number, y: number) => RangeDate | null;
    touchMoveThreshold: number;
}

export class MouseSelectionStrategy implements SelectionStrategy {
    constructor(
        private handlers: {
            start: (y: number, m: number, d: number) => void;
            update: (y: number, m: number, d: number) => void;
            end: (callback: (range: EventRange) => void) => void;
        }
    ) { }

    start = (y: number, m: number, d: number) => this.handlers.start(y, m, d);
    update = (y: number, m: number, d: number) => this.handlers.update(y, m, d);
    end = (callback: (range: EventRange) => void) => this.handlers.end(callback);
}

export class TouchSelectionStrategy implements SelectionStrategy {
    private longPressTimer: ReturnType<typeof setTimeout> | null = null;
    private touchStartPos: { x: number; y: number } | null = null;

    constructor(private options: TouchStrategyOptions) { }

    start = () => { };

    update = () => { };

    end = (callback: (range: EventRange) => void) => {
        if (this.options.getState().selectionMode) {
            this.options.setIsDragging(false);
            this.options.setSelectionMode(false);
            this.options.finaliseDrag(callback);
        }
    };

    onTouchStart = (e: React.TouchEvent, y: number, m: number, d: number) => {
        this.touchStartPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };

        this.longPressTimer = setTimeout(() => {
            this.options.setSelectionMode(true);
            this.options.setIsDragging(true);
            this.options.setDragStart({ year: y, month: m, day: d });
            this.options.setDragCurrent({ year: y, month: m, day: d });
            if (navigator.vibrate) navigator.vibrate(50);
        }, 500);
    };

    onTouchMove = (e: React.TouchEvent) => {
        const { selectionMode } = this.options.getState();
        if (selectionMode) {
            if (e.cancelable) e.preventDefault();

            const touch = e.touches[0];
            const cellDate = this.options.getCellFromPoint(touch.clientX, touch.clientY);

            if (cellDate) {
                this.options.setDragCurrent(cellDate);
            }
            return;
        }

        if (this.touchStartPos) {
            const dx = e.touches[0].clientX - this.touchStartPos.x;
            const dy = e.touches[0].clientY - this.touchStartPos.y;
            if (Math.abs(dx) > this.options.touchMoveThreshold || Math.abs(dy) > this.options.touchMoveThreshold) {
                if (this.longPressTimer) clearTimeout(this.longPressTimer);
            }
        }
    };

    onTouchEnd = (callback: (range: EventRange) => void) => {
        if (this.longPressTimer) clearTimeout(this.longPressTimer);

        if (this.options.getState().selectionMode) {
            this.options.setIsDragging(false);
            this.options.setSelectionMode(false);
            this.options.finaliseDrag(callback);
        }
        this.touchStartPos = null;
    };

    onContextMenu = (e: React.MouseEvent) => {
        const { selectionMode, isDragging } = this.options.getState();
        if (selectionMode || isDragging) {
            e.preventDefault();
        }
    };

    cleanup = () => {
        if (this.longPressTimer) clearTimeout(this.longPressTimer);
    };
}
