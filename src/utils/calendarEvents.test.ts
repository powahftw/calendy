import { describe, expect, it } from 'vitest';
import {
    buildDayEventMap,
    CalendarEvent,
    formatEventTimeRange,
    getLeadingEmoji,
    getPillEmoji,
    hasEmoji,
    isPillEvent,
    toCalendarEvent,
    toCalendarEvents
} from './calendarEvents';
import { getDateKey } from './calendarUtils';

const allDay = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
    id: 'all-day',
    title: 'Lisbon',
    start: '2026-07-14',
    end: '2026-07-16',
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

describe('hasEmoji', () => {
    it('detects pictographs', () => {
        expect(hasEmoji('✈️ FCO → LIS')).toBe(true);
        expect(hasEmoji('Standup 🚩')).toBe(true);
    });

    it('does not treat digits, # or * as emoji', () => {
        // \p{Emoji} matches these; Extended_Pictographic is the correct test.
        expect(hasEmoji('Flight 447')).toBe(false);
        expect(hasEmoji('#standup')).toBe(false);
        expect(hasEmoji('2 * 3 review')).toBe(false);
    });

    it('is false for plain titles', () => {
        expect(hasEmoji('Dentist')).toBe(false);
    });
});

describe('getLeadingEmoji', () => {
    it('keeps a variation selector with its base character', () => {
        expect(getLeadingEmoji('✈️ FCO → LIS')).toBe('✈️');
    });

    it('finds an emoji that is not at the start', () => {
        expect(getLeadingEmoji('Trip to Porto 🚆')).toBe('🚆');
    });

    it('returns undefined when there is none', () => {
        expect(getLeadingEmoji('Dentist')).toBeUndefined();
    });
});

describe('toCalendarEvent', () => {
    it('converts an all-day event and makes its end inclusive', () => {
        const event = toCalendarEvent({
            id: 'a',
            summary: 'Lisbon',
            start: { date: '2026-07-14' },
            end: { date: '2026-07-17' }
        });

        expect(event).toMatchObject({
            title: 'Lisbon',
            start: '2026-07-14',
            end: '2026-07-16',
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
        expect(event?.title).toBe('✈️ FCO → LIS');
    });

    it('falls back to a placeholder title', () => {
        const event = toCalendarEvent({ id: 'c', start: { date: '2026-07-14' } });
        expect(event?.title).toBe('(no title)');
    });

    it('drops events with no usable start', () => {
        expect(toCalendarEvent({ id: 'd', summary: 'Broken' })).toBeNull();
        expect(toCalendarEvents([{ id: 'd', summary: 'Broken' }])).toEqual([]);
    });
});

describe('isPillEvent', () => {
    it('is true for a timed event with an emoji', () => {
        expect(isPillEvent(timed())).toBe(true);
    });

    it('is false for a timed event without an emoji', () => {
        expect(isPillEvent(timed({ title: 'Dentist' }))).toBe(false);
    });

    it('is false for an all-day event even when its title has an emoji', () => {
        expect(isPillEvent(allDay({ title: '✈️ Lisbon' }))).toBe(false);
    });

    it('pills every timed event when the relaxed rule is on', () => {
        expect(isPillEvent(timed({ title: 'Dentist' }), true)).toBe(true);
        expect(isPillEvent(allDay({ title: '✈️ Lisbon' }), true)).toBe(false);
    });
});

describe('buildDayEventMap', () => {
    it('spreads an all-day event across every day it covers', () => {
        const map = buildDayEventMap([allDay()], VIEW);

        expect(map.get(getDateKey(2026, 6, 14))?.allDay).toHaveLength(1);
        expect(map.get(getDateKey(2026, 6, 16))?.allDay).toHaveLength(1);
        expect(map.get(getDateKey(2026, 6, 17))).toBeUndefined();
    });

    it('groups several pill events onto one day, sorted by start time', () => {
        const map = buildDayEventMap([
            timed({ id: 'late', title: '🚩 Dinner', startTime: '19:30', endTime: '21:00' }),
            timed({ id: 'early', title: '✈️ FCO → LIS', startTime: '06:40' })
        ], VIEW);

        const day = map.get(getDateKey(2026, 6, 14));
        expect(day?.pill.map((event) => event.id)).toEqual(['early', 'late']);
        expect(day?.allDay).toHaveLength(0);
    });

    it('keeps a full-day chip and a pill on the same day', () => {
        const map = buildDayEventMap([allDay(), timed()], VIEW);

        const day = map.get(getDateKey(2026, 6, 14));
        expect(day?.allDay).toHaveLength(1);
        expect(day?.pill).toHaveLength(1);
    });

    it('leaves timed events without an emoji off the grid by default', () => {
        const map = buildDayEventMap([timed({ title: 'Dentist' })], VIEW);
        expect(map.size).toBe(0);
    });

    it('includes them once the relaxed rule is on', () => {
        const map = buildDayEventMap([timed({ title: 'Dentist' })], VIEW, true);
        expect(map.get(getDateKey(2026, 6, 14))?.pill).toHaveLength(1);
    });

    it('ignores events outside the visible months', () => {
        const map = buildDayEventMap([allDay()], { year: 2026, startMonth: 0, monthsToShow: 3 });
        expect(map.size).toBe(0);
    });
});

describe('getPillEmoji', () => {
    it('uses the first emoji it finds', () => {
        expect(getPillEmoji([timed({ title: 'Dentist' }), timed({ title: '🚆 Train' })])).toBe('🚆');
    });

    it('falls back to a neutral dot', () => {
        expect(getPillEmoji([timed({ title: 'Dentist' })])).toBe('•');
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
