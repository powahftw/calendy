import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GoogleEvent } from '../services/CalendarService';
import { clearEventCache, readCachedEvents } from '../utils/eventCache';

const mockListEvents = vi.fn<(calendarId: string, timeMin: string, timeMax: string) => Promise<GoogleEvent[]>>();

vi.mock('../services/CalendarService', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../services/CalendarService')>();
    return {
        ...actual,
        calendarService: {
            hasValidToken: () => true,
            clearAccessToken: vi.fn(),
            listEvents: (...args: [string, string, string]) => mockListEvents(...args),
        },
    };
});

const { useCalendarEvents } = await import('./useCalendarEvents');

const eventOn = (id: string, date: string): GoogleEvent => ({
    id,
    summary: id,
    start: { date },
    end: { date }
});

const ensureAccess = vi.fn(async () => true);

const renderEvents = (calendarId: string | null) => renderHook(
    ({ id }: { id: string | null }) => useCalendarEvents({
        calendarId: id,
        year: 2026,
        startMonth: 0,
        monthsToShow: 12,
        ensureAccess
    }),
    { initialProps: { id: calendarId } }
);

const renderMultipleCalendars = (calendarIds: string[]) => renderHook(() => useCalendarEvents({
    calendarIds,
    year: 2026,
    startMonth: 0,
    monthsToShow: 12,
    ensureAccess
}));

describe('useCalendarEvents', () => {
    beforeEach(() => {
        localStorage.clear();
        clearEventCache();
        vi.clearAllMocks();
        ensureAccess.mockResolvedValue(true);
        mockListEvents.mockResolvedValue([eventOn('a', '2026-07-14')]);
    });

    afterEach(() => {
        localStorage.clear();
        clearEventCache();
    });

    it('fetches the visible year and caches it', async () => {
        const { result } = renderEvents('cal-1');

        await waitFor(() => expect(result.current.events).toHaveLength(1));

        expect(mockListEvents).toHaveBeenCalledTimes(1);
        expect(mockListEvents.mock.calls[0][0]).toBe('cal-1');
        expect(readCachedEvents('cal-1', 2026)?.events).toHaveLength(1);
    });

    it('merges events from every selected calendar', async () => {
        mockListEvents.mockImplementation(async (calendarId) => [
            eventOn(`event-${calendarId}`, '2026-07-14')
        ]);

        const { result } = renderMultipleCalendars(['cal-1', 'cal-2']);

        await waitFor(() => expect(result.current.events).toHaveLength(2));
        expect(mockListEvents.mock.calls.map(([calendarId]) => calendarId)).toEqual(['cal-1', 'cal-2']);
        expect(result.current.events.map((event) => event.id)).toEqual([
            'cal-1:event-cal-1',
            'cal-2:event-cal-2'
        ]);
    });

    it('serves a fresh cache without hitting Google again', async () => {
        const first = renderEvents('cal-1');
        await waitFor(() => expect(first.result.current.events).toHaveLength(1));
        first.unmount();

        const second = renderEvents('cal-1');
        await waitFor(() => expect(second.result.current.events).toHaveLength(1));

        expect(mockListEvents).toHaveBeenCalledTimes(1);
    });

    it('refetches every year when refresh() is called', async () => {
        const { result } = renderEvents('cal-1');
        await waitFor(() => expect(result.current.events).toHaveLength(1));

        mockListEvents.mockResolvedValue([eventOn('a', '2026-07-14'), eventOn('b', '2026-08-01')]);
        await result.current.refresh();

        await waitFor(() => expect(result.current.events).toHaveLength(2));
        expect(mockListEvents).toHaveBeenCalledTimes(2);
    });

    it('loads the new calendar when it changes while a fetch is still in flight', async () => {
        // The re-entrancy guard must key on what is being fetched: a guard that
        // simply blocks "any load while one is running" drops this switch and
        // leaves the previous calendar's events on screen forever.
        let releaseFirst: (events: GoogleEvent[]) => void = () => { };
        mockListEvents.mockImplementationOnce(() => new Promise((resolve) => {
            releaseFirst = resolve;
        }));

        const { result, rerender } = renderEvents('cal-1');
        await waitFor(() => expect(mockListEvents).toHaveBeenCalledTimes(1));

        rerender({ id: 'cal-2' });
        mockListEvents.mockResolvedValue([eventOn('from-cal-2', '2026-09-01')]);

        await waitFor(() => expect(mockListEvents).toHaveBeenCalledTimes(2));
        releaseFirst([eventOn('from-cal-1', '2026-07-14')]);

        await waitFor(() => {
            expect(result.current.events.map((event) => event.id)).toEqual(['from-cal-2']);
        });
    });

    it('surfaces a reconnect message when access cannot be refreshed', async () => {
        ensureAccess.mockResolvedValue(false);

        const { result } = renderEvents('cal-1');

        await waitFor(() => expect(result.current.error).toMatch(/Reconnect Google Calendar/i));
        expect(mockListEvents).not.toHaveBeenCalled();
    });

    it('keeps showing cached events when a refresh fails', async () => {
        const { result } = renderEvents('cal-1');
        await waitFor(() => expect(result.current.events).toHaveLength(1));

        mockListEvents.mockRejectedValue(new Error('network down'));
        await result.current.refresh();

        await waitFor(() => expect(result.current.error).toBeTruthy());
        expect(result.current.events).toHaveLength(1);
    });

    it('clears events when no calendar is selected', async () => {
        const { result } = renderEvents(null);

        await waitFor(() => expect(result.current.events).toHaveLength(0));
        expect(mockListEvents).not.toHaveBeenCalled();
    });
});
