/**
 * Which Google Calendar the user is looking at. This is configuration, not
 * event data - it is the only calendar-related thing Calendy stores server
 * side, so the choice follows the user across devices.
 */
export interface CalendarSelection {
    calendarId: string;
    calendarSummary?: string;
    accountEmail?: string;
}

export const isCalendarSelection = (value: unknown): value is CalendarSelection => {
    if (!value || typeof value !== 'object') return false;

    const selection = value as Record<string, unknown>;
    return typeof selection.calendarId === 'string'
        && selection.calendarId.length > 0
        && (!('calendarSummary' in selection) || typeof selection.calendarSummary === 'string')
        && (!('accountEmail' in selection) || typeof selection.accountEmail === 'string');
};

/** The years a view spans, so events can be fetched and cached year by year. */
export const getViewYears = (year: number, startMonth: number, monthsToShow: number): number[] => {
    const years = new Set<number>();

    for (let i = 0; i < monthsToShow; i += 1) {
        years.add(year + Math.floor((startMonth + i) / 12));
    }

    return [...years].sort((a, b) => a - b);
};

/** Google wants RFC3339 instants; a whole local year is [Jan 1, next Jan 1). */
export const getYearBounds = (year: number) => ({
    timeMin: new Date(year, 0, 1, 0, 0, 0).toISOString(),
    timeMax: new Date(year + 1, 0, 1, 0, 0, 0).toISOString()
});
