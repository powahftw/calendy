import { describe, expect, it } from 'vitest';
import type { GoogleEvent } from '../services/CalendarService';
import {
    buildDayEventMap,
    deduplicateCalendarEvents,
    formatEventDateRange,
    formatEventTimeRange,
    toCalendarEvent,
    toCalendarEvents
} from './calendarEvents';
import type { CalendarEvent } from './calendarEvents';
import { getDateKey } from './calendarUtils';

const VIEW = { year: 2026, startMonth: 6, monthsToShow: 1 };

const allDay = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
    id: 'trip',
    title: 'Brazil',
    start: '2026-07-14',
    end: '2026-07-20',
    allDay: true,
    styleKey: 'trip',
    automaticColor: 0,
    color: 0,
    ...overrides
});

const timed = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
    id: 'flight',
    title: 'FCO → LIS',
    start: '2026-07-14',
    end: '2026-07-14',
    allDay: false,
    startTime: '06:40',
    endTime: '09:05',
    styleKey: 'flight',
    automaticColor: 1,
    color: 1,
    ...overrides
});

describe('toCalendarEvent', () => {
    it('converts Google exclusive all-day ranges to inclusive ranges', () => {
        const result = toCalendarEvent({
            id: 'trip',
            summary: 'Lisbon',
            start: { date: '2026-07-14' },
            end: { date: '2026-07-17' }
        });

        expect(result).toMatchObject({
            id: 'trip',
            start: '2026-07-14',
            end: '2026-07-16',
            allDay: true,
            styleKey: 'trip'
        });
    });

    it('uses a recurring-series key so every occurrence shares one style', () => {
        const googleEvent: GoogleEvent = {
            id: 'instance-id',
            recurringEventId: 'series-id',
            start: { date: '2026-07-14' },
            end: { date: '2026-07-15' }
        };

        expect(toCalendarEvent(googleEvent)?.styleKey).toBe('series-id');
    });

    it('handles a single-day all-day event', () => {
        const result = toCalendarEvent({
            id: 'holiday',
            summary: 'Holiday',
            start: { date: '2026-07-14' },
            end: { date: '2026-07-15' }
        });

        expect(result).toMatchObject({ start: '2026-07-14', end: '2026-07-14' });
    });

    it('converts a timed event with local times', () => {
        const result = toCalendarEvent({
            id: 'flight',
            summary: 'FCO to LIS',
            start: { dateTime: '2026-07-14T06:40:00+02:00' },
            end: { dateTime: '2026-07-14T09:05:00+02:00' }
        });

        expect(result?.allDay).toBe(false);
        expect(result?.startTime).toMatch(/^\d{2}:\d{2}$/);
        expect(result?.endTime).toMatch(/^\d{2}:\d{2}$/);
    });

    it('falls back to a placeholder title', () => {
        expect(toCalendarEvent({ id: 'untitled', start: { date: '2026-07-14' } })?.title)
            .toBe('(no title)');
    });

    it('drops events with no usable start', () => {
        const broken = { id: 'broken', summary: 'Broken' };
        expect(toCalendarEvent(broken)).toBeNull();
        expect(toCalendarEvents([broken])).toEqual([]);
    });

    it('assigns a deterministic solid fallback color', () => {
        const googleEvent: GoogleEvent = {
            id: 'same-event',
            start: { date: '2026-07-14' },
            end: { date: '2026-07-15' }
        };

        const first = toCalendarEvent(googleEvent);
        const second = toCalendarEvent({ ...googleEvent, summary: 'Edited title' });
        expect(second?.automaticColor).toBe(first?.automaticColor);
        expect(first?.automaticColor).toBeLessThan(5);
    });

    it('preserves an explicit Google color as a solid palette choice', () => {
        const result = toCalendarEvent({
            id: 'colored',
            colorId: '4',
            start: { date: '2026-07-14' },
            end: { date: '2026-07-15' }
        });

        expect(result?.automaticColor).toBe(2);
    });

    it('normalizes the description used for duplicate matching', () => {
        const result = toCalendarEvent({
            id: 'described',
            description: '  Gate 12  ',
            start: { date: '2026-07-14' },
            end: { date: '2026-07-15' }
        });

        expect(result?.description).toBe('Gate 12');
    });
});

describe('deduplicateCalendarEvents', () => {
    it('keeps the lowest stable ID for an exact duplicate regardless of input order', () => {
        const laterId = timed({ id: 'z-copy', styleKey: 'z-copy', description: 'Gate 12' });
        const stableWinner = timed({ id: 'a-copy', styleKey: 'a-copy', description: 'Gate 12' });

        expect(deduplicateCalendarEvents([laterId, stableWinner]).map((event) => event.id))
            .toEqual(['a-copy']);
        expect(deduplicateCalendarEvents([stableWinner, laterId]).map((event) => event.id))
            .toEqual(['a-copy']);
    });

    it('keeps events when title, time, or description differs', () => {
        const base = timed({ id: 'base', description: 'Gate 12' });
        const events = [
            base,
            timed({ id: 'title', title: 'Different', description: 'Gate 12' }),
            timed({ id: 'time', startTime: '07:00', description: 'Gate 12' }),
            timed({ id: 'description', description: 'Gate 14' })
        ];

        expect(deduplicateCalendarEvents(events)).toEqual(events);
    });
});

describe('buildDayEventMap', () => {
    it('spreads an all-day event across every day it covers', () => {
        const map = buildDayEventMap([allDay()], VIEW);

        expect(map.get(getDateKey(2026, 6, 14))?.allDay).toHaveLength(1);
        expect(map.get(getDateKey(2026, 6, 20))?.allDay).toHaveLength(1);
        expect(map.get(getDateKey(2026, 6, 21))).toBeUndefined();
    });

    it('keeps emoji and plain titles in the same simple event buckets', () => {
        const map = buildDayEventMap([
            allDay(),
            allDay({ id: 'hotel', styleKey: 'hotel', title: '🏨 Hotel' }),
            timed({ title: '✈️ FCO → LIS' }),
            timed({ id: 'dentist', styleKey: 'dentist', title: 'Dentist', startTime: '10:00' })
        ], VIEW);

        const day = map.get(getDateKey(2026, 6, 14));
        expect(day?.allDay.map((event) => event.id)).toEqual(['trip', 'hotel']);
        expect(day?.timed.map((event) => event.id)).toEqual(['flight', 'dentist']);
    });

    it('includes days that contain only timed events', () => {
        const map = buildDayEventMap([timed()], VIEW);
        expect(map.get(getDateKey(2026, 6, 14))?.timed).toHaveLength(1);
    });

    it('draws the longest all-day range first and sorts scheduled events by time', () => {
        const map = buildDayEventMap([
            allDay({ id: 'short', styleKey: 'short', title: 'Workshop', end: '2026-07-15' }),
            allDay({ id: 'long', styleKey: 'long', title: 'Brazil' }),
            timed({ id: 'late', styleKey: 'late', startTime: '19:30' }),
            timed({ id: 'early', styleKey: 'early', startTime: '06:10' })
        ], VIEW);

        const day = map.get(getDateKey(2026, 6, 14));
        expect(day?.allDay.map((event) => event.id)).toEqual(['long', 'short']);
        expect(day?.timed.map((event) => event.id)).toEqual(['early', 'late']);
    });

    it('ignores events outside the visible months', () => {
        const map = buildDayEventMap([allDay()], { year: 2026, startMonth: 0, monthsToShow: 3 });
        expect(map.size).toBe(0);
    });
});

describe('event detail labels', () => {
    it('uses the date instead of repeating all-day', () => {
        expect(formatEventDateRange(allDay({ start: '2026-07-14', end: '2026-07-14' }))).toBe('14 Jul');
    });

    it('shows the complete multi-day range', () => {
        expect(formatEventDateRange(allDay())).toBe('14–20 Jul');
        expect(formatEventDateRange(allDay({ start: '2026-07-30', end: '2026-08-02' }))).toBe('30 Jul–2 Aug');
    });

    it('renders timed ranges', () => {
        expect(formatEventTimeRange(timed())).toBe('06:40–09:05');
        expect(formatEventTimeRange(timed({ endTime: '06:40' }))).toBe('06:40');
    });
});
