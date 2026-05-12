import { describe, expect, it } from 'vitest';
import { PlannerEvent } from './calendarUtils';
import {
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
    it('converts Calendy inclusive ends to Google exclusive all-day ends', () => {
        expect(toGoogleAllDayRange(event)).toEqual({
            start: '2026-05-10',
            end: '2026-05-13'
        });
    });

    it('keeps single-day Calendy events as one-day Google all-day events', () => {
        const singleDay = { ...event, start: '2026-05-10', end: '2026-05-10' };

        expect(toGoogleAllDayRange(singleDay)).toEqual({
            start: '2026-05-10',
            end: '2026-05-11'
        });
    });

    it('syncs titled all-day events and skips emoji-only titles', () => {
        expect(isGoogleSyncEligible(event)).toBe(true);
        expect(isGoogleSyncEligible({ ...event, start: '2026-05-10', end: '2026-05-10' })).toBe(true);
        expect(isGoogleSyncEligible({ ...event, title: '\u{1F389}\u2728' })).toBe(false);
        expect(hasRealTitle('  \u{1F389} Party  ')).toBe(true);
    });
});
