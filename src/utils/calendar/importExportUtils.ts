import { PlannerEvent } from '../calendarUtils';

export const EXPORT_SEPARATOR = "|";

export type DuplicateMatcher = (newEvent: PlannerEvent, existingEvents: PlannerEvent[]) => boolean;

export const serializeEvents = (events: PlannerEvent[]): string => {
    // Sort events by start date, excluding events with no title (e.g. icon-only markers)
    const sorted = [...events]
        .filter(ev => ev.title && ev.title.trim().length > 0)
        .sort((a, b) => a.start.localeCompare(b.start));

    const lines: string[] = [];
    let lastMonth = "";

    sorted.forEach(ev => {
        const date = new Date(ev.start);
        const currentMonth = date.toLocaleString('en-US', { month: 'long', year: 'numeric' });

        if (currentMonth !== lastMonth) {
            if (lines.length > 0) lines.push(""); // Add spacing between months
            lines.push(`-- ${currentMonth}`);
            lastMonth = currentMonth;
        }

        lines.push(`${ev.start} ${EXPORT_SEPARATOR} ${ev.end} ${EXPORT_SEPARATOR} ${ev.color} ${EXPORT_SEPARATOR} ${ev.title}`);
    });

    return lines.join('\n');
};

export const parseEvents = (text: string): PlannerEvent[] => {
    const lines = text.split('\n');
    const events: PlannerEvent[] = [];

    lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('--')) return;

        const parts = trimmed.split(EXPORT_SEPARATOR).map(p => p.trim());
        if (parts.length >= 4) {
            const [start, end, colorStr, ...titleParts] = parts;
            // Sanitize title to prevent XSS
            const title = titleParts.join(EXPORT_SEPARATOR).trim().replace(/</g, "&lt;").replace(/>/g, "&gt;");

            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (dateRegex.test(start) && dateRegex.test(end)) {
                events.push({
                    id: crypto.randomUUID(),
                    start,
                    end,
                    color: parseInt(colorStr) || 0,
                    title
                });
            }
        }
    });
    return events;
};

export const isDuplicate = (newEvent: PlannerEvent, existingEvents: PlannerEvent[]): boolean => {
    return existingEvents.some(ex =>
        ex.start === newEvent.start &&
        ex.end === newEvent.end &&
        ex.title === newEvent.title &&
        ex.color === newEvent.color
    );
};

export const isCalendarImportDuplicate = (newEvent: PlannerEvent, existingEvents: PlannerEvent[]): boolean => {
    return existingEvents.some(ex =>
        ex.start === newEvent.start &&
        ex.end === newEvent.end &&
        ex.title === newEvent.title
    );
};

export const mergeImportedEvents = (
    importedEvents: PlannerEvent[],
    existingEvents: PlannerEvent[],
    isEventDuplicate: DuplicateMatcher = isDuplicate
) => {
    const uniqueEvents: PlannerEvent[] = [];
    let duplicateCount = 0;

    importedEvents.forEach((event) => {
        const comparisonPool = [...existingEvents, ...uniqueEvents];

        if (isEventDuplicate(event, comparisonPool)) {
            duplicateCount += 1;
            return;
        }

        uniqueEvents.push(event);
    });

    return {
        uniqueEvents,
        duplicateCount,
        mergedEvents: [...existingEvents, ...uniqueEvents]
    };
};

