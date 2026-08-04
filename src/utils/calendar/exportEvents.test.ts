import { describe, expect, it } from 'vitest';
import { exportEventsToMarkdown, getEventsInView, getExportFilename } from './exportEvents';
import type { CalendarEvent } from '../calendarEvents';

const EVENTS: CalendarEvent[] = [
    {
        id: 'trip',
        title: 'Lisbon',
        start: '2026-07-14',
        end: '2026-07-16',
        allDay: true,
        styleKey: 'trip',
        automaticColor: 0,
        color: 0
    },
    {
        id: 'flight',
        title: '✈️ FCO → LIS',
        start: '2026-07-14',
        end: '2026-07-14',
        allDay: false,
        startTime: '06:40',
        endTime: '09:05',
        styleKey: 'flight',
        automaticColor: 0,
        color: 0
    },
    {
        id: 'dentist',
        title: 'Dentist',
        start: '2026-09-02',
        end: '2026-09-02',
        allDay: false,
        startTime: '10:00',
        endTime: '10:30',
        styleKey: 'dentist',
        automaticColor: 1,
        color: 1
    }
];

const YEAR_VIEW = { year: 2026, startMonth: 0, monthsToShow: 12, calendarName: 'Personal' };

describe('getEventsInView', () => {
    it('keeps only events starting inside the visible months', () => {
        const inView = getEventsInView(EVENTS, { year: 2026, startMonth: 6, monthsToShow: 1 });
        expect(inView.map((event) => event.id)).toEqual(['trip', 'flight']);
    });

    it('sorts by date, all-day first, then by start time', () => {
        const inView = getEventsInView(EVENTS, YEAR_VIEW);
        expect(inView.map((event) => event.id)).toEqual(['trip', 'flight', 'dentist']);
    });
});

describe('exportEventsToMarkdown', () => {
    it('groups events under month headings and includes times for timed events', () => {
        const markdown = exportEventsToMarkdown(EVENTS, YEAR_VIEW);

        expect(markdown).toContain('# Personal — January 2026 – December 2026');
        expect(markdown).toContain('## July 2026');
        expect(markdown).toContain('- 2026-07-14 06:40–09:05 — ✈️ FCO → LIS');
        expect(markdown).toContain('- 2026-07-14 → 2026-07-16 — Lisbon');
        expect(markdown).toContain('## September 2026');
    });

    it('includes timed events that never reach the grid', () => {
        // "Dentist" has no emoji, so it is not a pill, but it is still an event.
        expect(exportEventsToMarkdown(EVENTS, YEAR_VIEW)).toContain('— Dentist');
    });

    it('says so when the range is empty', () => {
        expect(exportEventsToMarkdown([], YEAR_VIEW)).toContain('_No events in this range._');
    });
});

describe('getExportFilename', () => {
    it('names a single-year export', () => {
        expect(getExportFilename(YEAR_VIEW)).toBe('calendy_export_2026.md');
    });

    it('names a cross-year export', () => {
        expect(getExportFilename({ year: 2026, startMonth: 6, monthsToShow: 12 }))
            .toBe('calendy_export_2026-2027.md');
    });
});
