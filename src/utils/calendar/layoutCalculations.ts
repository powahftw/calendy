import { getDaysInMonth, getDayOfWeekIndex } from '../calendarUtils';

export interface CellData {
    type: 'spacer' | 'day' | 'filler';
    id: string;
    day?: number;
    index: number;
}

export interface MonthLayoutConfig {
    year: number;
    monthIndex: number;
    weekdayAlign: boolean;
    maxRows: number;
}

export function generateMonthLayout(config: MonthLayoutConfig): CellData[] {
    const { year, monthIndex, weekdayAlign, maxRows } = config;
    const cells: CellData[] = [];

    // Spacers (align to weekday)
    if (weekdayAlign) {
        const firstDayIndex = getDayOfWeekIndex(year, monthIndex, 1);
        for (let i = 0; i < firstDayIndex; i++) {
            cells.push({
                type: 'spacer',
                id: `${monthIndex}-spacer-${i}`,
                index: i
            });
        }
    }

    // Actual days
    const daysInMonth = getDaysInMonth(year, monthIndex);
    for (let day = 1; day <= daysInMonth; day++) {
        cells.push({
            type: 'day',
            id: `${monthIndex}-day-${day}`,
            day,
            index: cells.length
        });
    }

    // Fillers (to reach maxRows)
    while (cells.length < maxRows) {
        cells.push({
            type: 'filler',
            id: `${monthIndex}-filler-${cells.length}`,
            index: cells.length
        });
    }

    return cells;
}
