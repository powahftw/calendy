import { describe, it, expect } from 'vitest';
import { calculateViewProgress, formatDateRange, getMonthYear, getYearLabel } from './calendarUtils';

describe('calendarUtils', () => {
    describe('getMonthYear', () => {
        it('calculates month and year correctly in same year', () => {
            const { month, year } = getMonthYear(2026, 0, 5);
            expect(month).toBe(5);
            expect(year).toBe(2026);
        });

        it('calculates month and year correctly spanning multiple years', () => {
            const { month, year } = getMonthYear(2026, 10, 5); // Start at Nov
            // Nov (10), Dec (11), Jan (0), Feb (1), Mar (2), Apr (3) <- Index 5 is Apr next year
            expect(month).toBe(3);
            expect(year).toBe(2027);
        });

        it('calculates exactly next year', () => {
            const { month, year } = getMonthYear(2026, 0, 12);
            expect(month).toBe(0);
            expect(year).toBe(2027);
        });
    });

    describe('getYearLabel', () => {
        it('returns single year for standard view', () => {
            expect(getYearLabel(2026, 0, 12)).toBe('2026');
            expect(getYearLabel(2026, 0, 3)).toBe('2026');
        });

        it('returns year range for cross-year view', () => {
            expect(getYearLabel(2026, 5, 12)).toBe('2026-2027');
            expect(getYearLabel(2026, 11, 3)).toBe('2026-2027');
        });

        it('returns single year if view ends exactly at end of year', () => {
            // Started July (6), 6 months -> ends in Dec. All in 2026.
            expect(getYearLabel(2026, 6, 6)).toBe('2026');
        });
    });

    describe('calculateViewProgress', () => {
        it('calculates progress correctly within same year', () => {
            const date = new Date(2026, 0, 15);
            const { current, total } = calculateViewProgress(2026, 0, 12, date);
            expect(current).toBe(15);
            expect(total).toBe(365);
        });

        it('calculates progress correctly across years', () => {
            const today = new Date(2026, 5, 10);
            const { current } = calculateViewProgress(2026, 5, 12, today);
            expect(current).toBe(10);
        });

        it('calculates progress correctly in the second year of the span', () => {
            const today = new Date(2027, 0, 10); // Jan 10th 2027
            // Span starts June 2026. 
            // June (30), July (31), Aug (31), Sept (30), Oct (31), Nov (30), Dec (31) = 214 days in 2026
            // Jan 10th = 224 days total
            const { current } = calculateViewProgress(2026, 5, 12, today);
            expect(current).toBe(214 + 10);
        });
    });

    describe('formatDateRange', () => {
        it('returns a single formatted date for same-day ranges', () => {
            expect(formatDateRange('2026-01-15', '2026-01-15', 'dayMonth')).toBe('15-01');
        });

        it('returns the full range for multi-day events', () => {
            expect(formatDateRange('2026-01-15', '2026-01-17', 'monthDay')).toBe('01/15 - 01/17');
        });
    });
});
