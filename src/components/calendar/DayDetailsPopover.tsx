import { useEffect, useRef, useState } from 'react';
import {
    FloatingPortal,
    autoUpdate,
    flip,
    hide,
    offset,
    shift,
    size,
    useDismiss,
    useFloating,
    useInteractions
} from '@floating-ui/react';
import {
    usePlanner,
    usePlannerDetailsState,
    usePlannerInteraction
} from '../../context/PlannerContext';
import type { CalendarEvent } from '../../utils/calendarEvents';
import { formatEventDateRange, formatEventTimeRange } from '../../utils/calendarEvents';
import { getEventStylePresentation } from '../../utils/eventStylePresentation';
import { useTheme } from '../../hooks/useTheme';

const MOBILE_QUERY = '(max-width: 600px), (pointer: coarse)';

const useMobileDetails = () => {
    const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);

    useEffect(() => {
        const query = window.matchMedia(MOBILE_QUERY);
        const update = () => setIsMobile(query.matches);
        query.addEventListener('change', update);
        return () => query.removeEventListener('change', update);
    }, []);

    return isMobile;
};

const EventRow = ({ event, isAllDay }: { event: CalendarEvent; isAllDay: boolean }) => {
    const { cycleEventStyle } = usePlanner();
    const colors = useTheme();
    const presentation = getEventStylePresentation(event.color, colors);

    return (
        <div className="day-details-item">
            <button
                type="button"
                className={`day-details-color ${presentation.className}`}
                style={presentation.style}
                aria-label={`Cycle color for ${event.title}`}
                onClick={() => cycleEventStyle(event)}
            />
            <span className="day-details-when">
                {isAllDay ? formatEventDateRange(event) : formatEventTimeRange(event)}
            </span>
            <span className="day-details-title">{event.title}</span>
        </div>
    );
};

const DayDetailsPopover = () => {
    const { eventMap } = usePlanner();
    const { openDayDetails } = usePlannerDetailsState();
    const {
        scheduleDayDetailsClose,
        cancelDayDetailsClose,
        closeDayDetails
    } = usePlannerInteraction();
    const isMobile = useMobileDetails();
    const open = Boolean(openDayDetails);
    const mobileHistoryMarkerRef = useRef<string | null>(null);
    const { refs, floatingStyles, context, middlewareData } = useFloating({
        open,
        onOpenChange: (nextOpen) => {
            if (!nextOpen) closeDayDetails();
        },
        elements: { reference: openDayDetails?.anchor ?? null },
        placement: 'right-start',
        strategy: 'fixed',
        whileElementsMounted: autoUpdate,
        middleware: [
            offset(8),
            flip({ fallbackAxisSideDirection: 'start', padding: 8 }),
            shift({ padding: 8 }),
            size({
                padding: 8,
                apply({ availableHeight, availableWidth, elements }) {
                    Object.assign(elements.floating.style, {
                        maxHeight: `${Math.max(0, availableHeight)}px`,
                        maxWidth: `${Math.max(0, Math.min(360, availableWidth))}px`,
                        '--day-details-content-height': `${Math.max(80, availableHeight - 108)}px`
                    });
                }
            }),
            hide({ padding: 4 })
        ]
    });
    const dismiss = useDismiss(context, { outsidePressEvent: 'pointerdown' });
    const { getFloatingProps } = useInteractions([dismiss]);

    useEffect(() => {
        if (!isMobile || !open) return;

        const marker = `calendy-day-details-${Date.now()}`;
        window.history.pushState({ ...window.history.state, calendyDayDetails: marker }, '');
        mobileHistoryMarkerRef.current = marker;

        const handleBack = () => {
            if (mobileHistoryMarkerRef.current !== marker) return;
            mobileHistoryMarkerRef.current = null;
            closeDayDetails();
        };
        window.addEventListener('popstate', handleBack);

        return () => {
            window.removeEventListener('popstate', handleBack);
            if (mobileHistoryMarkerRef.current === marker
                && window.history.state?.calendyDayDetails === marker) {
                mobileHistoryMarkerRef.current = null;
                window.history.back();
            }
        };
    }, [closeDayDetails, isMobile, open]);

    if (!openDayDetails) return null;
    const events = eventMap.get(openDayDetails.dayKey);
    if (!events) return null;

    const [year, month, day] = openDayDetails.dayKey.split('-').map(Number);
    const date = new Date(year, month, day);
    const dateLabel = date.toLocaleDateString(undefined, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
    const eventCount = events.allDay.length + events.timed.length;
    const referenceHidden = middlewareData.hide?.referenceHidden;

    const panel = (
        <div
            ref={refs.setFloating}
            {...getFloatingProps({
                className: `day-details-popover ${isMobile ? 'day-details-mobile' : ''}`,
                style: isMobile ? undefined : {
                    ...floatingStyles,
                    visibility: referenceHidden ? 'hidden' : undefined
                },
                role: 'dialog',
                'aria-modal': isMobile || undefined,
                'aria-label': `${eventCount} event${eventCount === 1 ? '' : 's'} on ${dateLabel}`,
                onMouseEnter: cancelDayDetailsClose,
                onMouseLeave: isMobile ? undefined : scheduleDayDetailsClose
            })}
        >
            <div className="day-details-header">
                <div>
                    <div className="day-details-date">{dateLabel}</div>
                    <div className="day-details-total">{eventCount} event{eventCount === 1 ? '' : 's'}</div>
                </div>
                <button type="button" className="day-details-close" onClick={closeDayDetails} aria-label="Close event details">×</button>
            </div>

            <div className="day-details-content">
                {events.allDay.length > 0 && (
                    <section className="day-details-section" aria-label="All-day events">
                        <h3>All-day events</h3>
                        {events.allDay.map((event) => <EventRow key={event.id} event={event} isAllDay />)}
                    </section>
                )}
                {events.timed.length > 0 && (
                    <section className="day-details-section" aria-label="Scheduled events">
                        <h3>Scheduled</h3>
                        {events.timed.map((event) => <EventRow key={event.id} event={event} isAllDay={false} />)}
                    </section>
                )}
            </div>
            <div className="day-details-help">{isMobile ? 'Tap' : 'Select'} a color line to cycle its style.</div>
        </div>
    );

    return (
        <FloatingPortal>
            {isMobile ? (
                <div
                    className="day-details-backdrop"
                    onPointerDown={(event) => {
                        if (event.target === event.currentTarget) closeDayDetails();
                    }}
                >
                    {panel}
                </div>
            ) : panel}
        </FloatingPortal>
    );
};

export default DayDetailsPopover;
