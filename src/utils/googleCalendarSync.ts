import { PlannerEvent, TRANSPARENT_COLOR_INDEX, uid } from './calendarUtils';
import type { GoogleEvent } from '../services/CalendarService';

const EMOJI_PATTERN = /\p{Emoji}/gu;

export interface GoogleSyncSettings {
    enabled: boolean;
    calendarId: string;
    syncToken: string;
    lastSyncedAt: number;
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

export const fromGoogleAllDayRange = (event: GoogleEvent): { start: string; end: string } | null => {
    const start = event.start?.date;
    const googleEnd = event.end?.date;

    if (!start || !googleEnd) return null;

    const end = shiftDate(googleEnd, -1);
    // ISO date strings compare lexicographically in chronological order.
    return start <= end ? { start, end } : null;
};

export const googleEventToPlannerEvent = (event: GoogleEvent): PlannerEvent | null => {
    const range = fromGoogleAllDayRange(event);
    const title = event.summary?.trim() ?? '';

    if (!range || !event.id || !hasRealTitle(title)) return null;

    return {
        id: uid(),
        title,
        start: range.start,
        end: range.end,
        color: Math.floor(Math.random() * TRANSPARENT_COLOR_INDEX),
        gcalEventId: event.id
    };
};
