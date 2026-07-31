import type { GoogleEvent } from '../services/CalendarService';
import { getDateKey, getDatesInRange, toDateStr } from './calendarUtils';

/**
 * Whether a character is "an emoji" for our purposes.
 *
 * `\p{Emoji}` is the wrong property to test with: it also matches plain digits,
 * `#` and `*`, so "Flight 447" would count. `Extended_Pictographic` is the one
 * that means "actually a pictograph" - but it does not cover flags, which are
 * pairs of Regional Indicators, so those need naming separately.
 */
const EMOJI_IN_CLUSTER = /[\p{Extended_Pictographic}\p{Regional_Indicator}]/u;

/**
 * Fallback for engines without Intl.Segmenter. Deliberately keeps both
 * variation selectors: U+FE0F asks for the colour glyph (✈️) and U+FE0E asks
 * for the monochrome one (✈︎). Dropping either changes how the title renders.
 */
const LEADING_EMOJI_PATTERN = new RegExp(
    '^(?:'
    + '\\p{Regional_Indicator}\\p{Regional_Indicator}'
    + '|\\p{Extended_Pictographic}[\\uFE0E\\uFE0F]?(?:[\\u{1F3FB}-\\u{1F3FF}])?'
    + '(?:\\u200D\\p{Extended_Pictographic}[\\uFE0E\\uFE0F]?(?:[\\u{1F3FB}-\\u{1F3FF}])?)*'
    + ')',
    'u'
);

const graphemeSegmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

/**
 * The first user-perceived character, which is what "starts with an emoji"
 * has to mean. A grapheme cluster keeps variation selectors, skin-tone
 * modifiers, ZWJ sequences and flag pairs together as one unit.
 */
const getFirstGrapheme = (text: string): string => {
    if (graphemeSegmenter) {
        const first = graphemeSegmenter.segment(text)[Symbol.iterator]().next();
        return first.done ? '' : first.value.segment;
    }

    return text.match(LEADING_EMOJI_PATTERN)?.[0] ?? text.slice(0, 2);
};

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
    /** Rendered as the full-width day chip. */
    allDay: CalendarEvent[];
    /** Collapsed into a single hover/tap pill. */
    pill: CalendarEvent[];
}

/**
 * The emoji a title opens with, or undefined. Returned verbatim - including
 * any variation selector - so the pill renders the glyph the user typed.
 */
export const getLeadingEmoji = (text: string): string | undefined => {
    const trimmed = text.trimStart();
    if (!trimmed) return undefined;

    const cluster = getFirstGrapheme(trimmed);
    return EMOJI_IN_CLUSTER.test(cluster) ? cluster : undefined;
};

/** A leading emoji is the mark that downgrades an event to the day's pill. */
export const startsWithEmoji = (text: string): boolean => getLeadingEmoji(text) !== undefined;

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
 * How an event wants to be drawn. Duration decides nothing here: a leading
 * emoji is the single signal that an event is logistics rather than the
 * headline for its days.
 *
 * - `chip`     an all-day event with a plain title, e.g. "Brazil"
 * - `marked`   any title opening with an emoji, e.g. "🏨 Hotel do Mar",
 *              "✈︎ FCO → LIS". Collapses into the day's pill and gives that
 *              pill its emoji.
 * - `unmarked` a timed event with a plain title, e.g. "Dentist". Too small to
 *              own a day, so it only ever appears inside a pill's popover.
 */
export type EventRole = 'chip' | 'marked' | 'unmarked';

export const getEventRole = (event: CalendarEvent): EventRole => {
    if (startsWithEmoji(event.title)) return 'marked';
    return event.allDay ? 'chip' : 'unmarked';
};

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
    return spanB - spanA || a.title.localeCompare(b.title);
};

/**
 * Buckets events onto the days they cover, keeping only the months currently on
 * screen. Multi-day events land on every day they span.
 *
 * A day gets a pill as soon as one `marked` event touches it; `unmarked`
 * events then ride along in that pill's popover. A day holding nothing but
 * `unmarked` events stays empty, which keeps a year of routine meetings from
 * burying the things worth seeing - unless `pillUnmarkedEvents` is on, in
 * which case they get a neutral pill of their own.
 */
export const buildDayEventMap = (
    events: CalendarEvent[],
    view: { year: number; startMonth: number; monthsToShow: number },
    pillUnmarkedEvents = false
): Map<string, DayEvents> => {
    const map = new Map<string, DayEvents>();
    const collapsed = new Map<string, { marked: CalendarEvent[]; unmarked: CalendarEvent[] }>();
    const startMonthTotal = view.year * 12 + view.startMonth;
    const endMonthTotal = startMonthTotal + view.monthsToShow;

    for (const event of events) {
        const role = getEventRole(event);

        for (const date of getDatesInRange(event.start, event.end)) {
            const dateMonthTotal = date.year * 12 + date.month;
            if (dateMonthTotal < startMonthTotal || dateMonthTotal >= endMonthTotal) continue;

            const dateKey = getDateKey(date.year, date.month, date.day);

            if (role === 'chip') {
                const dayEvents = map.get(dateKey);
                if (dayEvents) dayEvents.allDay.push(event);
                else map.set(dateKey, { allDay: [event], pill: [] });
                continue;
            }

            const bucket = collapsed.get(dateKey);
            if (bucket) bucket[role].push(event);
            else collapsed.set(dateKey, role === 'marked' ? { marked: [event], unmarked: [] } : { marked: [], unmarked: [event] });
        }
    }

    for (const [dateKey, bucket] of collapsed) {
        if (bucket.marked.length === 0 && !pillUnmarkedEvents) continue;

        const pill = [...bucket.marked, ...bucket.unmarked].sort(byStartTime);
        const dayEvents = map.get(dateKey);
        if (dayEvents) dayEvents.pill = pill;
        else map.set(dateKey, { allDay: [], pill });
    }

    for (const dayEvents of map.values()) {
        dayEvents.allDay.sort(byRangeLength);
    }

    return map;
};

/**
 * The emoji a day's pill shows: the first marked event's, in start-time order.
 * Undefined for a pill built only from unmarked events - those fall back to
 * showing the event count on its own.
 */
export const getPillEmoji = (pillEvents: CalendarEvent[]): string | undefined => {
    for (const event of pillEvents) {
        const emoji = getLeadingEmoji(event.title);
        if (emoji) return emoji;
    }

    return undefined;
};

export const formatEventTimeRange = (event: CalendarEvent): string => {
    if (event.allDay || !event.startTime) return 'All day';
    if (!event.endTime || event.endTime === event.startTime) return event.startTime;
    return `${event.startTime}–${event.endTime}`;
};
