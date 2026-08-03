import { getDaysInMonth, getDayOfWeekIndex } from '../calendarUtils';

/**
 * The rows of one month column: a day number, or null for a blank row.
 *
 * Blanks come from two places - weekday alignment at the top, and padding at
 * the bottom so every column ends up the same height - but they render
 * identically, so they are not worth telling apart.
 */
export const generateMonthLayout = (
    year: number,
    monthIndex: number,
    weekdayAlign: boolean,
    rows: number
): Array<number | null> => {
    const leadingBlanks = weekdayAlign ? getDayOfWeekIndex(year, monthIndex, 1) : 0;
    const daysInMonth = getDaysInMonth(year, monthIndex);

    return Array.from({ length: rows }, (_, row) => {
        const day = row - leadingBlanks + 1;
        return day >= 1 && day <= daysInMonth ? day : null;
    });
};
