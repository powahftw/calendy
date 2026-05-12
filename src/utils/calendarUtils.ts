export type ThemeId = 'blue' | 'forest' | 'pastel' | 'dark';

export const STRIPED_COLOR_INDEX = 5;
export const DOTTED_COLOR_INDEX = 6;
export const TRANSPARENT_COLOR_INDEX = 7;

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
    icon?: string;
    gcalEventId?: string;
}

export interface EventDraft {
    title?: string;
    start: string;
    end: string;
    color: number;
    icon?: string;
}

export interface PlannerSettings {
    theme: ThemeId;
    highlightToday: boolean;
    showWeekends: boolean;
    showDayProgress: boolean;
    weekdayAlign: boolean;
    year: number;
    startMonth: number;
    monthsToShow: number;
}

export const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const daysOfWeek = ["M", "T", "W", "T", "F", "S", "S"];

export const themes: Theme[] = [
    { id: 'blue', name: 'Modern Blue', primary: '#3b82f6' },
    { id: 'forest', name: 'Forest', primary: '#8d8172' },
    { id: 'pastel', name: 'Pastel', primary: '#f472b6' },
    { id: 'dark', name: 'Dark Mode', primary: '#818cf8' },
];

export const defaultBluePalette = ["#3b82f6", "#10b981", "#db2777", "#f59e0b", "#8b5cf6", "#6366f1", "#ef4444", "transparent"];

export const getThemeColors = (themeId: ThemeId): string[] => {
    if (themeId === 'forest') {
        return ["#5C7886", "#627264", "#8B5E5E", "#BC9663", "#7A728A", "#646E82", "#A65D57", "transparent"];
    }
    if (themeId === 'pastel') {
        return ["#a0c4ff", "#baffc9", "#ffb3ba", "#ffdfba", "#eecbff", "#bae1ff", "#ffb3e6", "transparent"];
    }
    if (themeId === 'dark') {
        return ["#60a5fa", "#34d399", "#f472b6", "#fbbf24", "#a78bfa", "#818cf8", "#f87171", "transparent"];
    }
    return defaultBluePalette;
};

export const getDaysInMonth = (year: number, month: number): number => new Date(year, month + 1, 0).getDate();

export const getDayOfWeekIndex = (year: number, month: number, day: number): number => {
    const d = new Date(year, month, day).getDay();
    return (d + 6) % 7;
};

export const uid = (): string => Date.now().toString(36) + Math.random().toString(36).substring(2);

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
    if (startStr === endStr) {
        return formatter(startStr);
    }
    return `${formatter(startStr)} - ${formatter(endStr)}`;
};

export const isDateInRange = (year: number, month: number, day: number, startStr: string, endStr: string): boolean => {
    const currentStr = toDateStr(year, month, day);
    return currentStr >= startStr && currentStr <= endStr;
};

export const getMonthYear = (baseYear: number, startMonth: number, columnIndex: number): { year: number, month: number } => {
    const totalMonths = startMonth + columnIndex;
    return {
        year: baseYear + Math.floor(totalMonths / 12),
        month: totalMonths % 12
    };
};

export const getYearLabel = (baseYear: number, startMonth: number, monthsToShow: number): string => {
    const end = getMonthYear(baseYear, startMonth, monthsToShow - 1);
    if (baseYear === end.year) {
        return `${baseYear}`;
    }
    return `${baseYear}-${end.year}`;
};

/**
 * Calculates current progress and total days for the visible months in a given year/startMonth.
 */
export const calculateViewProgress = (
    viewYear: number,
    startMonth: number,
    monthsToShow: number,
    today: Date = new Date()
): { current: number; total: number } => {
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth();
    const todayDate = today.getDate();

    let totalDays = 0;
    let currentProgress = 0;

    for (let i = 0; i < monthsToShow; i++) {
        const { year: currentYear, month: currentMonth } = getMonthYear(viewYear, startMonth, i);
        const daysInMonth = getDaysInMonth(currentYear, currentMonth);
        totalDays += daysInMonth;

        if (currentYear < todayYear) {
            currentProgress += daysInMonth;
        } else if (currentYear === todayYear) {
            if (currentMonth < todayMonth) {
                currentProgress += daysInMonth;
            } else if (currentMonth === todayMonth) {
                currentProgress += Math.min(todayDate, daysInMonth);
            }
        }
    }

    return { current: currentProgress, total: totalDays };
};

export const getDisplayEvent = (events: PlannerEvent[]): PlannerEvent | undefined => {
    if (!events || events.length === 0) return undefined;

    const mainEvent = events[0];

    const eventWithIcon = events.find(e => e.icon && e.icon.trim() !== '');
    const icon = eventWithIcon ? eventWithIcon.icon : mainEvent.icon;

    const eventWithColor = events.find(e => e.color !== TRANSPARENT_COLOR_INDEX);
    const color = eventWithColor ? eventWithColor.color : mainEvent.color;

    const eventWithTitle = events.find(e => e.title && e.title.trim() !== '');
    const title = eventWithTitle ? eventWithTitle.title : mainEvent.title;

    return {
        ...mainEvent,
        title,
        icon,
        color
    };
};
