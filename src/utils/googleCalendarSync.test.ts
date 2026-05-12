import { describe, expect, it } from 'vitest';
import { PlannerEvent } from './calendarUtils';
import {
    fromGoogleAllDayRange,
    hasRealTitle,
    isGoogleSyncEligible,
    toGoogleAllDayRange
} from './googleCalendarSync';

const event: PlannerEvent = {
    id: 'event-1',
    title: 'Trip',
    start: '2026-05-10',
    end: '2026-05-12',
    color: 0
};

describe('googleCalendarSync', () => {
    it('keeps Calendy inclusive ends and Google exclusive all-day ends aligned', () => {
        expect(toGoogleAllDayRange(event)).toEqual({
            start: '2026-05-10',
            end: '2026-05-13'
        });

        expect(fromGoogleAllDayRange({
            id: 'gcal-1',
            summary: 'Trip',
            start: { date: '2026-05-10' },
            end: { date: '2026-05-13' }
        })).toEqual({
            start: '2026-05-10',
            end: '2026-05-12'
        });
    });

    it('keeps single-day Calendy events as one-day Google all-day events', () => {
        const singleDay = { ...event, start: '2026-05-10', end: '2026-05-10' };

        expect(toGoogleAllDayRange(singleDay)).toEqual({
            start: '2026-05-10',
            end: '2026-05-11'
        });

        expect(fromGoogleAllDayRange({
            id: 'gcal-2',
            summary: 'Doctor',
            start: { date: '2026-05-10' },
            end: { date: '2026-05-11' }
        })).toEqual({
            start: '2026-05-10',
            end: '2026-05-10'
        });
    });

    it('syncs titled all-day events and skips emoji-only titles', () => {
        expect(isGoogleSyncEligible(event)).toBe(true);
        expect(isGoogleSyncEligible({ ...event, start: '2026-05-10', end: '2026-05-10' })).toBe(true);
        expect(isGoogleSyncEligible({ ...event, title: '🎉✨' })).toBe(false);
        expect(hasRealTitle('  🎉 Party  ')).toBe(true);
    });

    it('ignores timed Google events', () => {
        expect(fromGoogleAllDayRange({
            id: 'timed-1',
            summary: 'Timed meeting',
            start: { dateTime: '2026-05-10T09:00:00+02:00' },
            end: { dateTime: '2026-05-10T10:00:00+02:00' }
        })).toBeNull();
    });
});
