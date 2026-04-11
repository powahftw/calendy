import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarService } from './CalendarService';

describe('CalendarService', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-11T10:30:00.000Z'));
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ items: [] })
        }));
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('fetches events for the next 12 months starting today', async () => {
        const service = new CalendarService();
        (service as any).token = 'token';

        await service.listEvents('primary');

        const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
        const requestUrl = new URL(fetchMock.mock.calls[0][0] as string);
        const expectedStart = new Date('2026-04-11T10:30:00.000Z');
        expectedStart.setHours(0, 0, 0, 0);
        const expectedEnd = new Date(expectedStart);
        expectedEnd.setFullYear(expectedEnd.getFullYear() + 1);

        expect(requestUrl.searchParams.get('timeMin')).toBe(expectedStart.toISOString());
        expect(requestUrl.searchParams.get('timeMax')).toBe(expectedEnd.toISOString());
    });
});
