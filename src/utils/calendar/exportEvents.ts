import { CalendarEvent, formatEventTimeRange } from '../calendarEvents';
import { getMonthYear, parseDateStr } from '../calendarUtils';

const MONTH_LABELS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

export interface ExportView {
    year: number;
    startMonth: number;
    monthsToShow: number;
    calendarName?: string;
}

const getMonthKey = (year: number, month: number) => year * 12 + month;

/** Events whose start date falls inside the months currently on screen. */
export const getEventsInView = (events: CalendarEvent[], view: ExportView): CalendarEvent[] => {
    const firstMonth = getMonthKey(view.year, view.startMonth);
    const lastMonth = firstMonth + view.monthsToShow - 1;

    return events
        .filter((event) => {
            const { year, month } = parseDateStr(event.start);
            const eventMonth = getMonthKey(year, month - 1);
            return eventMonth >= firstMonth && eventMonth <= lastMonth;
        })
        .sort((a, b) => (
            a.start.localeCompare(b.start)
            || (a.startTime ?? '').localeCompare(b.startTime ?? '')
            || a.title.localeCompare(b.title)
        ));
};

const formatDateRange = (event: CalendarEvent): string => (
    event.start === event.end ? event.start : `${event.start} → ${event.end}`
);

const getRangeLabel = (view: ExportView): string => {
    const first = getMonthYear(view.year, view.startMonth, 0);
    const last = getMonthYear(view.year, view.startMonth, view.monthsToShow - 1);
    const from = `${MONTH_LABELS[first.month]} ${first.year}`;
    const to = `${MONTH_LABELS[last.month]} ${last.year}`;
    return from === to ? from : `${from} – ${to}`;
};

/**
 * Renders the visible range as Markdown: every event, full-day and pill alike,
 * grouped under a month heading. Timed events carry their times.
 */
export const exportEventsToMarkdown = (events: CalendarEvent[], view: ExportView): string => {
    const inView = getEventsInView(events, view);
    const lines: string[] = [
        `# ${view.calendarName || 'Calendar'} — ${getRangeLabel(view)}`,
        ''
    ];

    if (inView.length === 0) {
        lines.push('_No events in this range._');
        return `${lines.join('\n')}\n`;
    }

    let lastMonthKey: number | null = null;

    for (const event of inView) {
        const { year, month } = parseDateStr(event.start);
        const monthKey = getMonthKey(year, month - 1);

        if (monthKey !== lastMonthKey) {
            if (lastMonthKey !== null) lines.push('');
            lines.push(`## ${MONTH_LABELS[month - 1]} ${year}`, '');
            lastMonthKey = monthKey;
        }

        const time = event.allDay ? '' : ` ${formatEventTimeRange(event)}`;
        lines.push(`- ${formatDateRange(event)}${time} — ${event.title}`);
    }

    return `${lines.join('\n')}\n`;
};

export const getExportFilename = (view: ExportView): string => {
    const last = getMonthYear(view.year, view.startMonth, view.monthsToShow - 1);
    const suffix = view.year === last.year ? `${view.year}` : `${view.year}-${last.year}`;
    return `calendy_export_${suffix}.md`;
};
