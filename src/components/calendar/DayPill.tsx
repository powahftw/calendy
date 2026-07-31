import React, { FC, useCallback, useEffect, useRef } from 'react';
import { CalendarEvent, formatEventTimeRange, getPillEmoji } from '../../utils/calendarEvents';
import { monthNames } from '../../utils/calendarUtils';

interface DayPillProps {
    dayKey: string;
    date: { year: number; month: number; day: number };
    events: CalendarEvent[];
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    /** Months on the left of the grid flip the popover to their right side. */
    flipPopover: boolean;
}

/**
 * One pill per day, grouping every timed event that collapsed onto it.
 * Hover reveals the detail on pointer devices; tap toggles it on touch, since
 * hover does not exist there.
 */
const DayPill: FC<DayPillProps> = ({ dayKey, date, events, isOpen, onOpenChange, flipPopover }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    // A tap fires both pointerdown and a synthetic mouseenter on touch devices;
    // this keeps the tap from immediately re-opening what it just closed.
    const isTouchRef = useRef(false);

    const close = useCallback(() => onOpenChange(false), [onOpenChange]);

    useEffect(() => {
        if (!isOpen) return;

        const handlePointerDown = (event: PointerEvent) => {
            if (!containerRef.current?.contains(event.target as Node)) close();
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') close();
        };

        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [close, isOpen]);

    const emoji = getPillEmoji(events);
    const count = events.length;
    // With no emoji to show, the count carries the pill on its own.
    const showCount = count > 1 || !emoji;
    const label = `${count} event${count === 1 ? '' : 's'} on ${date.day} ${monthNames[date.month]}`;

    return (
        <div
            ref={containerRef}
            className="day-pill-container"
            onMouseEnter={() => {
                if (!isTouchRef.current) onOpenChange(true);
            }}
            onMouseLeave={() => {
                if (!isTouchRef.current) close();
            }}
        >
            <button
                type="button"
                id={`day-pill-${dayKey}`}
                className={`day-pill ${isOpen ? 'is-open' : ''}`}
                aria-expanded={isOpen}
                aria-controls={`day-pill-popover-${dayKey}`}
                aria-label={label}
                title={label}
                onPointerDown={(e) => {
                    isTouchRef.current = e.pointerType === 'touch' || e.pointerType === 'pen';
                }}
                onClick={() => onOpenChange(!isOpen)}
            >
                {emoji && <span className="day-pill-emoji" aria-hidden="true">{emoji}</span>}
                {/* Clamped to two characters so the pill's width stays fixed. */}
                {showCount && <span className="day-pill-count">{count > 9 ? '9+' : count}</span>}
            </button>

            {isOpen && (
                <div
                    id={`day-pill-popover-${dayKey}`}
                    className={`pill-popover ${flipPopover ? 'pill-popover-flipped' : ''}`}
                    role="dialog"
                    aria-labelledby={`day-pill-${dayKey}`}
                >
                    <div className="pill-popover-date">{date.day} {monthNames[date.month]} {date.year}</div>
                    {events.map((event) => (
                        <div key={event.id} className="pill-popover-item">
                            <span className="pill-popover-time">{formatEventTimeRange(event)}</span>
                            <span className="pill-popover-title">{event.title}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default DayPill;
