import type { GoogleEvent } from '../services/CalendarService';
import {
    AUTOMATIC_SOLID_COLOR_COUNT,
    getDateKey,
    getDatesInRange,
    monthNames,
    parseDateStr,
    toDateStr
} from './calendarUtils';

/** Google's 11 event colours, mapped onto the five solid legacy styles. */
const GOOGLE_COLOR_ID_TO_PALETTE_INDEX: Record<string, number> = {
    '1': 4, '2': 1, '3': 4, '4': 2, '5': 3, '6': 3,
    '7': 0, '8': 0, '9': 0, '10': 1, '11': 2
};

export interface CalendarEvent {
    id: string;
    title: string;
    /** Inclusive local start date, `YYYY-MM-DD`. */
    start: string;
    /** Inclusive local end date, `YYYY-MM-DD`. */
    end: string;
    allDay: boolean;
    /** Local `HH:MM`, timed events only. */
    startTime?: string;
    endTime?: string;
    /** Calendar-scoped key used for local and eventual remote style overrides. */
    styleKey: string;
    /** Google color or deterministic fallback before a user override. */
    automaticColor: number;
    color: number;
}

/** All events touching one day, split only for display ordering. */
export interface DayEvents {
    allDay: CalendarEvent[];
    timed: CalendarEvent[];
}

export const isAllDayEvent = (event: GoogleEvent): boolean => Boolean(event.start?.date);

const toLocalDateStr = (date: Date): string => toDateStr(date.getFullYear(), date.getMonth(), date.getDate());

const toLocalTimeStr = (date: Date): string => (
    `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
);

const shiftDateStr = (dateStr: string, days: number): string => {
    const [year, month, day] = dateStr.split('-').map(Number);
    const shifted = new Date(year, month - 1, day + days);
    return toLocalDateStr(shifted);
};

const hashString = (value: string): number => {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
};

const getStyleKey = (event: GoogleEvent): string => event.recurringEventId || event.iCalUID || event.id;

const toPaletteIndex = (event: GoogleEvent, styleKey: string): number => (
    event.colorId
        ? GOOGLE_COLOR_ID_TO_PALETTE_INDEX[event.colorId] ?? hashString(styleKey) % AUTOMATIC_SOLID_COLOR_COUNT
        : hashString(styleKey) % AUTOMATIC_SOLID_COLOR_COUNT
);

/**
 * Converts a Google event into Calendy's flat, local-time shape.
 * Returns null for events Google gave us without a usable start.
 */
export const toCalendarEvent = (event: GoogleEvent): CalendarEvent | null => {
    const title = event.summary?.trim() || '(no title)';
    const styleKey = getStyleKey(event);
    const automaticColor = toPaletteIndex(event, styleKey);

    if (isAllDayEvent(event)) {
        const start = event.start?.date;
        if (!start) return null;

        // Google's all-day `end.date` is exclusive; Calendy's is inclusive.
        const exclusiveEnd = event.end?.date;
        const end = exclusiveEnd ? shiftDateStr(exclusiveEnd, -1) : start;

        return {
            id: event.id,
            title,
            start,
            end: end < start ? start : end,
            allDay: true,
            styleKey,
            automaticColor,
            color: automaticColor
        };
    }

    const startDateTime = event.start?.dateTime;
    if (!startDateTime) return null;

    const startDate = new Date(startDateTime);
    if (Number.isNaN(startDate.getTime())) return null;

    const endDateTime = event.end?.dateTime;
    const endDate = endDateTime ? new Date(endDateTime) : startDate;
    const hasValidEnd = !Number.isNaN(endDate.getTime());
    const resolvedEnd = hasValidEnd ? endDate : startDate;

    return {
        id: event.id,
        title,
        start: toLocalDateStr(startDate),
        end: toLocalDateStr(resolvedEnd),
        allDay: false,
        startTime: toLocalTimeStr(startDate),
        endTime: toLocalTimeStr(resolvedEnd),
        styleKey,
        automaticColor,
        color: automaticColor
    };
};

export const toCalendarEvents = (events: GoogleEvent[]): CalendarEvent[] => (
    events
        .map(toCalendarEvent)
        .filter((event): event is CalendarEvent => event !== null)
);

const byStartTime = (a: CalendarEvent, b: CalendarEvent): number => (
    (a.startTime ?? '').localeCompare(b.startTime ?? '') || a.title.localeCompare(b.title)
);

/**
 * Longest range first, so the day's most significant block is the one drawn
 * when several all-day events overlap. Without this the winner would be
 * whatever order Google happened to return.
 */
const byRangeLength = (a: CalendarEvent, b: CalendarEvent): number => {
    const spanA = getDatesInRange(a.start, a.end).length;
    const spanB = getDatesInRange(b.start, b.end).length;
    // Array.prototype.sort is stable, so equal spans keep Google's ordering.
    return spanB - spanA;
};

/**
 * Buckets every event onto every visible day it touches. The longest all-day
 * event becomes the chip; everything else contributes to the +N badge and the
 * unified details popover.
 */
export const buildDayEventMap = (
    events: CalendarEvent[],
    view: { year: number; startMonth: number; monthsToShow: number }
): Map<string, DayEvents> => {
    const map = new Map<string, DayEvents>();
    const startMonthTotal = view.year * 12 + view.startMonth;
    const endMonthTotal = startMonthTotal + view.monthsToShow;

    for (const event of events) {
        for (const date of getDatesInRange(event.start, event.end)) {
            const dateMonthTotal = date.year * 12 + date.month;
            if (dateMonthTotal < startMonthTotal || dateMonthTotal >= endMonthTotal) continue;

            const dateKey = getDateKey(date.year, date.month, date.day);

            const dayEvents = map.get(dateKey);
            if (dayEvents) dayEvents[event.allDay ? 'allDay' : 'timed'].push(event);
            else map.set(dateKey, event.allDay ? { allDay: [event], timed: [] } : { allDay: [], timed: [event] });
        }
    }

    for (const dayEvents of map.values()) {
        dayEvents.allDay.sort(byRangeLength);
        dayEvents.timed.sort(byStartTime);
    }

    return map;
};

export const formatEventTimeRange = (event: CalendarEvent): string => {
    if (!event.startTime) return '';
    if (!event.endTime || event.endTime === event.startTime) return event.startTime;
    return `${event.startTime}–${event.endTime}`;
};

const formatDatePoint = (dateStr: string, includeYear: boolean): string => {
    const { year, month, day } = parseDateStr(dateStr);
    return `${day} ${monthNames[month - 1]}${includeYear ? ` ${year}` : ''}`;
};

/** A compact full event range, never the repetitive label "All day". */
export const formatEventDateRange = (event: CalendarEvent): string => {
    const start = parseDateStr(event.start);
    const end = parseDateStr(event.end);
    if (event.start === event.end) return formatDatePoint(event.start, false);
    if (start.year === end.year && start.month === end.month) {
        return `${start.day}–${end.day} ${monthNames[start.month - 1]}`;
    }
    const crossesYear = start.year !== end.year;
    return `${formatDatePoint(event.start, crossesYear)}–${formatDatePoint(event.end, crossesYear)}`;
};
