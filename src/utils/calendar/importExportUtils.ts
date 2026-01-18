import { PlannerEvent } from '../calendarUtils';

export const EXPORT_SEPARATOR = "|";

export const serializeEvents = (events: PlannerEvent[]): string => {
    // Format: StartDate | EndDate | ColorIndex | Title
    // YYYY-MM-DD | YYYY-MM-DD | 0 | My Event
    return events.map(ev => {
        return `${ev.start} ${EXPORT_SEPARATOR} ${ev.end} ${EXPORT_SEPARATOR} ${ev.color} ${EXPORT_SEPARATOR} ${ev.title}`;
    }).join('\n');
};

export const parseEvents = (text: string): PlannerEvent[] => {
    const lines = text.split('\n');
    const events: PlannerEvent[] = [];

    lines.forEach(line => {
        if (!line.trim()) return;
        const parts = line.split(EXPORT_SEPARATOR).map(p => p.trim());
        if (parts.length >= 4) {
            const [start, end, colorStr, ...titleParts] = parts;
            const title = titleParts.join(EXPORT_SEPARATOR).trim(); // Rejoin if title had separator

            // Basic validation: check if start/end look like dates
            // Simple regex for YYYY-MM-DD
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
