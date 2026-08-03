import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    EVENT_CACHE_TTL_MS,
    clearEventCache,
    isCacheFresh,
    readCachedEvents,
    writeCachedEvents
} from './eventCache';
import type { CalendarEvent } from './calendarEvents';

const EVENTS: CalendarEvent[] = [{
    id: 'a',
    title: 'Lisbon',
    start: '2026-07-14',
    end: '2026-07-16',
    allDay: true,
    color: 0
}];

describe('eventCache', () => {
    beforeEach(() => {
        localStorage.clear();
        clearEventCache();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        localStorage.clear();
        clearEventCache();
    });

    it('round-trips events per calendar and year', () => {
        writeCachedEvents('cal-1', 2026, EVENTS, 1000);

        expect(readCachedEvents('cal-1', 2026)).toEqual({ events: EVENTS, fetchedAt: 1000 });
        expect(readCachedEvents('cal-1', 2027)).toBeNull();
        expect(readCachedEvents('cal-2', 2026)).toBeNull();
    });

    it('treats a cache entry as stale once the TTL has passed', () => {
        const now = 10_000_000;

        expect(isCacheFresh({ events: EVENTS, fetchedAt: now - 1000 }, now)).toBe(true);
        expect(isCacheFresh({ events: EVENTS, fetchedAt: now - EVENT_CACHE_TTL_MS }, now)).toBe(false);
        expect(isCacheFresh(null, now)).toBe(false);
    });

    it('discards a record written by an older cache version', () => {
        localStorage.setItem(
            'calendy_events_v1_cal-1::2026',
            JSON.stringify({ version: 0, events: EVENTS, fetchedAt: 1000 })
        );
        clearEventCache();

        expect(readCachedEvents('cal-1', 2026)).toBeNull();
    });

    it('keeps serving events from memory when localStorage rejects the write', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new DOMException('quota', 'QuotaExceededError');
        });

        writeCachedEvents('cal-1', 2026, EVENTS, 1000);

        expect(readCachedEvents('cal-1', 2026)).toEqual({ events: EVENTS, fetchedAt: 1000 });
    });

    it('clears every cached calendar', () => {
        writeCachedEvents('cal-1', 2026, EVENTS, 1000);
        writeCachedEvents('cal-2', 2026, EVENTS, 1000);

        clearEventCache();

        expect(readCachedEvents('cal-1', 2026)).toBeNull();
        expect(readCachedEvents('cal-2', 2026)).toBeNull();
    });
});
