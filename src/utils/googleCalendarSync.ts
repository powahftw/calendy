import { PlannerEvent } from './calendarUtils';

const EMOJI_PATTERN = /\p{Emoji}/gu;

export interface GoogleSyncSettings {
    enabled: boolean;
    calendarId: string;
}

export const hasRealTitle = (title: string): boolean => (
    title.replace(EMOJI_PATTERN, '').trim().length > 0
);

export const isGoogleSyncEligible = (event: PlannerEvent): boolean => (
    // ISO date strings compare lexicographically in chronological order.
    event.start <= event.end && hasRealTitle(event.title)
);

const shiftDate = (dateStr: string, days: number): string => {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + days));
    return date.toISOString().slice(0, 10);
};

export const toGoogleAllDayRange = (event: PlannerEvent) => ({
    start: event.start,
    end: shiftDate(event.end, 1)
});
