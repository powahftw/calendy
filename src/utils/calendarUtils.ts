export type ThemeId = 'blue' | 'forest' | 'pastel' | 'dark';

export interface Theme {
    id: ThemeId;
    name: string;
    primary: string;
}

export interface RangeDate {
    year: number;
    month: number;
    day: number;
}

export interface EventRange {
    start: RangeDate;
    end: RangeDate;
}

export interface PlannerEvent {
    id: string;
    title: string;
    start: string;
    end: string;
    color: number;
    emoji?: string;
}

export interface EventDraft {
    title?: string;
    start: string;
    end: string;
    color: number;
    emoji?: string;
}

export interface PlannerSettings {
    theme: ThemeId;
    highlightToday: boolean;
    showWeekends: boolean;
    showDayProgress: boolean;
    weekdayAlign: boolean;
    year: number;
    monthsToShow: number;
}

export const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const daysOfWeek = ["M", "T", "W", "T", "F", "S", "S"];

// Theme Definitions
export const themes: Theme[] = [
    { id: 'blue', name: 'Modern Blue', primary: '#3b82f6' },
    { id: 'forest', name: 'Forest', primary: '#8d8172' },
    { id: 'pastel', name: 'Pastel', primary: '#f472b6' },
    { id: 'dark', name: 'Dark Mode', primary: '#818cf8' },
];

export const defaultBluePalette = ["#3b82f6", "#10b981", "#db2777", "#f59e0b", "#8b5cf6", "#6366f1", "#ef4444"];

export const getThemeColors = (themeId: ThemeId): string[] => {
    if (themeId === 'forest') {
        // Earthy / Sepia Tones
        return ["#5C7886", "#627264", "#8B5E5E", "#BC9663", "#7A728A", "#646E82", "#A65D57"];
    }
    if (themeId === 'pastel') {
        // Pastel Rainbow Fantasy
        return ["#a0c4ff", "#baffc9", "#ffb3ba", "#ffdfba", "#eecbff", "#bae1ff", "#ffb3e6"];
    }
    if (themeId === 'dark') {
        // Vivid/Neon for Dark Mode
        return ["#60a5fa", "#34d399", "#f472b6", "#fbbf24", "#a78bfa", "#818cf8", "#f87171"];
    }
    // Default Blue / Modern
    return defaultBluePalette;
};

export type ProvisionalPattern = 'striped' | 'dotted' | null;

export const getProvisionalPattern = (colorIndex: number, paletteLength: number): ProvisionalPattern => {
    if (paletteLength < 2) return null;
    if (colorIndex === paletteLength - 2) return 'striped';
    if (colorIndex === paletteLength - 1) return 'dotted';
    return null;
};

export const getProvisionalPatternStyles = (
    color: string,
    pattern: ProvisionalPattern,
    options?: {
        opacityHex?: string;
        border?: boolean;
        includeBorderLeft?: boolean;
    }
): Record<string, string> => {
    if (!pattern) return {};

    const opacityHex = options?.opacityHex ?? '15';
    const includeBorderLeft = options?.includeBorderLeft ?? true;
    const style: Record<string, string> = {
        backgroundColor: `${color}${opacityHex}`
    };

    if (pattern === 'striped') {
        style.backgroundImage = `repeating-linear-gradient(45deg, ${color}55 0, ${color}55 6px, transparent 6px, transparent 12px)`;
    } else {
        style.backgroundImage = `radial-gradient(${color}66 28%, transparent 30%)`;
        style.backgroundSize = '6px 6px';
    }

    if (options?.border) {
        style.border = `1px dotted ${color}`;
        if (includeBorderLeft) {
            style.borderLeft = `2px solid ${color}`;
        }
    }

    return style;
};

export const getDaysInMonth = (year: number, month: number): number => new Date(year, month + 1, 0).getDate();

export const getDayOfWeekIndex = (year: number, month: number, day: number): number => {
    const d = new Date(year, month, day).getDay();
    return (d + 6) % 7;
};

export const uid = (): string => Date.now().toString(36) + Math.random().toString(36).substr(2);

export const toDateStr = (year: number, month: number, day: number): string => {
    const mm = String(month + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${year}-${mm}-${dd}`;
};

export const getDateKey = (year: number, month: number, day: number): string => `${year}-${month}-${day}`;

export const parseDateStr = (dateStr: string): { year: number; month: number; day: number } => {
    const [year, month, day] = dateStr.split('-').map(Number);
    return { year, month, day };
};

export const toLocalDate = (dateStr: string): Date => {
    const { year, month, day } = parseDateStr(dateStr);
    return new Date(year, month - 1, day);
};

export const getDatesInRange = (startStr: string, endStr: string): RangeDate[] => {
    const start = toLocalDate(startStr);
    const end = toLocalDate(endStr);
    const dates: RangeDate[] = [];

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dates.push({
            year: d.getFullYear(),
            month: d.getMonth(),
            day: d.getDate()
        });
    }

    return dates;
};

export const formatMonthDay = (dateStr: string): string => {
    const { month, day } = parseDateStr(dateStr);
    return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
};

export const formatDayMonth = (dateStr: string): string => {
    const { month, day } = parseDateStr(dateStr);
    return `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}`;
};

export type DateRangeFormat = 'monthDay' | 'dayMonth';

export const formatDateRange = (startStr: string, endStr: string, format: DateRangeFormat): string => {
    const formatter = format === 'monthDay' ? formatMonthDay : formatDayMonth;
    return `${formatter(startStr)} - ${formatter(endStr)}`;
};

export const isDateInRange = (year: number, month: number, day: number, startStr: string, endStr: string): boolean => {
    const currentStr = toDateStr(year, month, day);
    return currentStr >= startStr && currentStr <= endStr;
};

/**
 * Calculates current progress and total days for the visible months in a given year.
 */
export const calculateViewProgress = (
    viewYear: number,
    monthsToShow: number,
    today: Date = new Date()
): { current: number; total: number } => {
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth();
    const todayDate = today.getDate();

    let totalDays = 0;
    let currentProgress = 0;

    for (let m = 0; m < monthsToShow; m++) {
        const daysInMonth = getDaysInMonth(viewYear, m);
        totalDays += daysInMonth;

        if (viewYear < todayYear) {
            currentProgress += daysInMonth;
        } else if (viewYear === todayYear) {
            if (m < todayMonth) {
                currentProgress += daysInMonth;
            } else if (m === todayMonth) {
                currentProgress += Math.min(todayDate, daysInMonth);
            }
        }
        // For years in the future, currentProgress remains 0 (or whatever it accumulated to).
        // Actually, logic dictates: if viewYear > todayYear, we add nothing to currentProgress.
    }

    return { current: currentProgress, total: totalDays };
};
