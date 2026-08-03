import { describe, expect, it } from 'vitest';
import { generateMonthLayout } from './layoutCalculations';

const ROWS = 37;

describe('generateMonthLayout', () => {
    it('starts at row 0 when weekday alignment is off', () => {
        const layout = generateMonthLayout(2026, 0, false, ROWS);

        expect(layout[0]).toBe(1);
        expect(layout[30]).toBe(31);
        expect(layout).toHaveLength(ROWS);
    });

    it('pads the tail so every column is the same height', () => {
        // February 2026 has 28 days; the rest of the column is blank.
        const layout = generateMonthLayout(2026, 1, false, ROWS);

        expect(layout[27]).toBe(28);
        expect(layout.slice(28).every((day) => day === null)).toBe(true);
    });

    it('offsets the first day to its weekday column', () => {
        // 1 Jan 2026 is a Thursday, so it sits on the fourth row (Mon-first).
        const layout = generateMonthLayout(2026, 0, true, ROWS);

        expect(layout.slice(0, 3)).toEqual([null, null, null]);
        expect(layout[3]).toBe(1);
        expect(layout[33]).toBe(31);
    });

    it('adds no offset when the month starts on a Monday', () => {
        // 1 June 2026 is a Monday.
        expect(generateMonthLayout(2026, 5, true, ROWS)[0]).toBe(1);
    });

    it('keeps days contiguous and in order', () => {
        const days = generateMonthLayout(2026, 0, true, ROWS).filter((day) => day !== null);

        expect(days).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
    });

    it('handles a leap February', () => {
        const days = generateMonthLayout(2028, 1, true, ROWS).filter((day) => day !== null);

        expect(days).toHaveLength(29);
    });
});
