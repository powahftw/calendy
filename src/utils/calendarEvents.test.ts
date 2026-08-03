import { describe, expect, it } from 'vitest';
import {
    buildDayEventMap,
    CalendarEvent,
    formatEventTimeRange,
    getEventRole,
    getLeadingEmoji,
    getPillEmoji,
    startsWithEmoji,
    toCalendarEvent,
    toCalendarEvents
} from './calendarEvents';
import { getDateKey } from './calendarUtils';

const allDay = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
    id: 'all-day',
    title: 'Brazil',
    start: '2026-07-14',
    end: '2026-07-20',
    allDay: true,
    color: 0,
    ...overrides
});

const timed = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
    id: 'timed',
    title: '✈️ FCO → LIS',
    start: '2026-07-14',
    end: '2026-07-14',
    allDay: false,
    startTime: '06:40',
    endTime: '09:05',
    color: 0,
    ...overrides
});

const VIEW = { year: 2026, startMonth: 0, monthsToShow: 12 };

describe('getLeadingEmoji', () => {
    it('finds an emoji at the start of the title', () => {
        expect(getLeadingEmoji('🏨 Hotel do Mar')).toBe('🏨');
    });

    it('keeps the colour variation selector (U+FE0F)', () => {
        expect(getLeadingEmoji('✈️ FCO → LIS')).toBe('✈️');
    });

    it('keeps the text variation selector (U+FE0E) so the glyph stays monochrome', () => {
        // '✈︎' and '🏠︎' ask for the text presentation; dropping U+FE0E would
        // flip them to the colour emoji the user deliberately avoided.
        expect(getLeadingEmoji('✈︎ FCO → LIS')).toBe('✈︎');
        expect(getLeadingEmoji('🏠︎ Home office')).toBe('🏠︎');
    });

    it('handles flags, which are Regional Indicator pairs rather than pictographs', () => {
        expect(getLeadingEmoji('🇧🇷 Brazil')).toBe('🇧🇷');
    });

    it('keeps a skin-tone modifier and a ZWJ sequence together', () => {
        expect(getLeadingEmoji('👍🏽 Approved')).toBe('👍🏽');
        expect(getLeadingEmoji('👨‍👩‍👧 Family day')).toBe('👨‍👩‍👧');
    });

    it('tolerates leading whitespace', () => {
        expect(getLeadingEmoji('  🚆 Train')).toBe('🚆');
    });

    it('is undefined when the emoji is not leading', () => {
        expect(getLeadingEmoji('Dinner 🚩')).toBeUndefined();
        expect(getLeadingEmoji('Brazil 🇧🇷')).toBeUndefined();
    });

    it('is undefined for plain titles', () => {
        expect(getLeadingEmoji('Dentist')).toBeUndefined();
        expect(getLeadingEmoji('')).toBeUndefined();
    });

    it('does not treat digits, # or * as emoji', () => {
        expect(startsWithEmoji('447 Flight')).toBe(false);
        expect(startsWithEmoji('#standup')).toBe(false);
        expect(startsWithEmoji('*urgent*')).toBe(false);
    });
});

describe('getEventRole', () => {
    it('makes a plain all-day event the day chip', () => {
        expect(getEventRole(allDay())).toBe('chip');
    });

    it('downgrades an all-day event that opens with an emoji', () => {
        expect(getEventRole(allDay({ title: '🏨 Hotel do Mar' }))).toBe('marked');
    });

    it('leaves an all-day event with a trailing emoji as the chip', () => {
        expect(getEventRole(allDay({ title: 'Brazil 🇧🇷' }))).toBe('chip');
    });

    it('marks a timed event that opens with an emoji', () => {
        expect(getEventRole(timed())).toBe('marked');
    });

    it('treats a plain timed event as popover-only', () => {
        expect(getEventRole(timed({ title: 'Dentist' }))).toBe('unmarked');
    });
});

describe('toCalendarEvent', () => {
    it('converts an all-day event and makes its end inclusive', () => {
        const event = toCalendarEvent({
            id: 'a',
            summary: 'Brazil',
            start: { date: '2026-07-14' },
            end: { date: '2026-07-21' }
        });

        expect(event).toMatchObject({
            title: 'Brazil',
            start: '2026-07-14',
            end: '2026-07-20',
            allDay: true
        });
    });

    it('handles a single-day all-day event', () => {
        const event = toCalendarEvent({
            id: 'a',
            summary: 'Holiday',
            start: { date: '2026-07-14' },
            end: { date: '2026-07-15' }
        });

        expect(event).toMatchObject({ start: '2026-07-14', end: '2026-07-14' });
    });

    it('converts a timed event with local times', () => {
        const event = toCalendarEvent({
            id: 'b',
            summary: '✈️ FCO → LIS',
            start: { dateTime: '2026-07-14T06:40:00+02:00' },
            end: { dateTime: '2026-07-14T09:05:00+02:00' }
        });

        expect(event?.allDay).toBe(false);
        expect(event?.startTime).toMatch(/^\d{2}:\d{2}$/);
    });

    it('falls back to a placeholder title', () => {
        expect(toCalendarEvent({ id: 'c', start: { date: '2026-07-14' } })?.title).toBe('(no title)');
    });

    it('drops events with no usable start', () => {
        expect(toCalendarEvent({ id: 'd', summary: 'Broken' })).toBeNull();
        expect(toCalendarEvents([{ id: 'd', summary: 'Broken' }])).toEqual([]);
    });
});

describe('buildDayEventMap', () => {
    it('spreads an all-day chip across every day it covers', () => {
        const map = buildDayEventMap([allDay()], VIEW);

        expect(map.get(getDateKey(2026, 6, 14))?.allDay).toHaveLength(1);
        expect(map.get(getDateKey(2026, 6, 20))?.allDay).toHaveLength(1);
        expect(map.get(getDateKey(2026, 6, 21))).toBeUndefined();
    });

    it('keeps the trip as the chip and the hotel as a pill on the same days', () => {
        const map = buildDayEventMap([
            allDay({ id: 'trip', title: 'Brazil' }),
            allDay({ id: 'hotel', title: '🏨 Hotel do Mar' })
        ], VIEW);

        const day = map.get(getDateKey(2026, 6, 14));
        expect(day?.allDay.map((event) => event.id)).toEqual(['trip']);
        expect(day?.pill.map((event) => event.id)).toEqual(['hotel']);
    });

    it('repeats the hotel pill across the whole stay', () => {
        const map = buildDayEventMap([allDay({ id: 'hotel', title: '🏨 Hotel do Mar' })], VIEW);

        expect(map.get(getDateKey(2026, 6, 14))?.pill).toHaveLength(1);
        expect(map.get(getDateKey(2026, 6, 17))?.pill).toHaveLength(1);
        expect(map.get(getDateKey(2026, 6, 20))?.pill).toHaveLength(1);
    });

    it('groups marked events onto one pill, sorted by start time', () => {
        const map = buildDayEventMap([
            timed({ id: 'late', title: '🚩 Dinner', startTime: '19:30', endTime: '21:00' }),
            timed({ id: 'early', title: '✈️ FCO → LIS', startTime: '06:40' })
        ], VIEW);

        expect(map.get(getDateKey(2026, 6, 14))?.pill.map((event) => event.id)).toEqual(['early', 'late']);
    });

    it('lets unmarked events ride along in a pill that already exists', () => {
        const map = buildDayEventMap([
            timed({ id: 'flight', title: '✈️ FCO → LIS', startTime: '06:40' }),
            timed({ id: 'dentist', title: 'Dentist', startTime: '10:00' })
        ], VIEW);

        expect(map.get(getDateKey(2026, 6, 14))?.pill.map((event) => event.id))
            .toEqual(['flight', 'dentist']);
    });

    it('leaves a day of only unmarked events empty by default', () => {
        const map = buildDayEventMap([timed({ title: 'Dentist' })], VIEW);
        expect(map.size).toBe(0);
    });

    it('gives that day a pill once the setting is on', () => {
        const map = buildDayEventMap([timed({ title: 'Dentist' })], VIEW, true);
        expect(map.get(getDateKey(2026, 6, 14))?.pill).toHaveLength(1);
    });

    it('draws the longest all-day event when several overlap', () => {
        // Otherwise the chip shown would be whatever order Google returned.
        const map = buildDayEventMap([
            allDay({ id: 'short', title: 'Workshop', start: '2026-07-14', end: '2026-07-15' }),
            allDay({ id: 'long', title: 'Brazil', start: '2026-07-14', end: '2026-07-20' })
        ], VIEW);

        expect(map.get(getDateKey(2026, 6, 14))?.allDay.map((event) => event.id))
            .toEqual(['long', 'short']);
    });

    it('ignores events outside the visible months', () => {
        const map = buildDayEventMap([allDay()], { year: 2026, startMonth: 0, monthsToShow: 3 });
        expect(map.size).toBe(0);
    });
});

describe('getPillEmoji', () => {
    it('uses the first marked event it finds', () => {
        expect(getPillEmoji([timed({ title: 'Dentist' }), timed({ title: '🚆 Train' })])).toBe('🚆');
    });

    it('is undefined when nothing in the pill is marked, so the count stands alone', () => {
        expect(getPillEmoji([timed({ title: 'Dentist' })])).toBeUndefined();
    });
});

describe('formatEventTimeRange', () => {
    it('labels all-day events', () => {
        expect(formatEventTimeRange(allDay())).toBe('All day');
    });

    it('renders a start and end time', () => {
        expect(formatEventTimeRange(timed())).toBe('06:40–09:05');
    });

    it('collapses a zero-length event to one time', () => {
        expect(formatEventTimeRange(timed({ endTime: '06:40' }))).toBe('06:40');
    });
});
