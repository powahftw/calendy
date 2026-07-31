import type { GoogleEvent } from '../services/CalendarService';
import { getDateKey, getDatesInRange, toDateStr } from './calendarUtils';

/**
 * `\p{Emoji}` is the wrong property to test with: it also matches plain digits,
 * `#` and `*`, so "Flight 447" would count as an emoji title.
 * `Extended_Pictographic` is the one that means "actually a pictograph".
 */
const EMOJI_PATTERN = /\p{Extended_Pictographic}/u;
const LEADING_EMOJI_PATTERN = /\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*/u;

/** Google's 11 event colours, mapped onto the 7 real palette slots per theme. */
const GOOGLE_COLOR_ID_TO_PALETTE_INDEX: Record<string, number> = {
    '1': 5, '2': 1, '3': 4, '4': 2, '5': 3, '6': 3,
    '7': 0, '8': 6, '9': 0, '10': 1, '11': 2
};

const DEFAULT_PALETTE_INDEX = 0;

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
    color: number;
}

/** The events on one day, split by how they should be rendered. */
export interface DayEvents {
    /** Rendered as the full-width day chip, exactly as before. */
    allDay: CalendarEvent[];
    /** Collapsed into a single hover/tap pill. */
    pill: CalendarEvent[];
}

export const hasEmoji = (text: string): boolean => EMOJI_PATTERN.test(text);

export const getLeadingEmoji = (text: string): string | undefined => (
    text.match(LEADING_EMOJI_PATTERN)?.[0]
);

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

const toPaletteIndex = (colorId?: string): number => (
    colorId ? GOOGLE_COLOR_ID_TO_PALETTE_INDEX[colorId] ?? DEFAULT_PALETTE_INDEX : DEFAULT_PALETTE_INDEX
);

/**
 * Converts a Google event into Calendy's flat, local-time shape.
 * Returns null for events Google gave us without a usable start.
 */
export const toCalendarEvent = (event: GoogleEvent): CalendarEvent | null => {
    const title = event.summary?.trim() || '(no title)';
    const color = toPaletteIndex(event.colorId);

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
            color
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
        color
    };
};

export const toCalendarEvents = (events: GoogleEvent[]): CalendarEvent[] => (
    events
        .map(toCalendarEvent)
        .filter((event): event is CalendarEvent => event !== null)
);

/**
 * An event collapses into a pill when it is *not* all-day and its title carries
 * an emoji. Full-day events always win: an all-day event with an emoji in its
 * title still renders as a full-day block.
 *
 * `pillForAllTimedEvents` relaxes the emoji half of the rule so that timed
 * events without an emoji are still visible somewhere instead of being dropped
 * from the view entirely.
 */
export const isPillEvent = (event: CalendarEvent, pillForAllTimedEvents = false): boolean => {
    if (event.allDay) return false;
    return pillForAllTimedEvents || hasEmoji(event.title);
};

const byStartTime = (a: CalendarEvent, b: CalendarEvent): number => (
    (a.startTime ?? '').localeCompare(b.startTime ?? '') || a.title.localeCompare(b.title)
);

/**
 * Buckets events onto the days they cover, keeping only the months currently on
 * screen. Multi-day events land on every day they span, matching how the grid
 * has always drawn them.
 */
export const buildDayEventMap = (
    events: CalendarEvent[],
    view: { year: number; startMonth: number; monthsToShow: number },
    pillForAllTimedEvents = false
): Map<string, DayEvents> => {
    const map = new Map<string, DayEvents>();
    const startMonthTotal = view.year * 12 + view.startMonth;
    const endMonthTotal = startMonthTotal + view.monthsToShow;

    for (const event of events) {
        const isPill = isPillEvent(event, pillForAllTimedEvents);

        // Timed events that are neither all-day nor pill-eligible have no place
        // on the grid; they still reach the export.
        if (!event.allDay && !isPill) continue;

        for (const date of getDatesInRange(event.start, event.end)) {
            const dateMonthTotal = date.year * 12 + date.month;
            if (dateMonthTotal < startMonthTotal || dateMonthTotal >= endMonthTotal) continue;

            const dateKey = getDateKey(date.year, date.month, date.day);
            let dayEvents = map.get(dateKey);
            if (!dayEvents) {
                dayEvents = { allDay: [], pill: [] };
                map.set(dateKey, dayEvents);
            }

            if (isPill) dayEvents.pill.push(event);
            else dayEvents.allDay.push(event);
        }
    }

    for (const dayEvents of map.values()) {
        dayEvents.pill.sort(byStartTime);
    }

    return map;
};

/** The emoji a day's pill shows: the first one found, scanning by start time. */
export const getPillEmoji = (pillEvents: CalendarEvent[]): string => {
    for (const event of pillEvents) {
        const emoji = getLeadingEmoji(event.title);
        if (emoji) return emoji;
    }

    return '•';
};

export const formatEventTimeRange = (event: CalendarEvent): string => {
    if (event.allDay || !event.startTime) return 'All day';
    if (!event.endTime || event.endTime === event.startTime) return event.startTime;
    return `${event.startTime}–${event.endTime}`;
};
