import { describe, it, expect } from 'vitest';
import { serializeEvents, parseEvents, EXPORT_SEPARATOR } from '../importExportUtils';
import { PlannerEvent } from '../../calendarUtils';

describe('importExportUtils', () => {
    const mockEvents: PlannerEvent[] = [
        {
            id: '1',
            start: '2026-01-15',
            end: '2026-01-18',
            color: 0,
            title: 'Test Event 1'
        },
        {
            id: '2',
            start: '2026-02-10',
            end: '2026-02-10',
            color: 2,
            title: 'Test Event 2 | with pipes'
        }
    ];

    it('should serialize events correctly', () => {
        const serialized = serializeEvents(mockEvents);
        const lines = serialized.split('\n');

        expect(lines.length).toBe(2);
        expect(lines[0]).toBe(`2026-01-15 ${EXPORT_SEPARATOR} 2026-01-18 ${EXPORT_SEPARATOR} 0 ${EXPORT_SEPARATOR} Test Event 1`);
        expect(lines[1]).toBe(`2026-02-10 ${EXPORT_SEPARATOR} 2026-02-10 ${EXPORT_SEPARATOR} 2 ${EXPORT_SEPARATOR} Test Event 2 | with pipes`);
    });

    it('should parse serialized events correctly', () => {
        const serialized = serializeEvents(mockEvents);
        const parsed = parseEvents(serialized);

        expect(parsed.length).toBe(2);
        expect(parsed[0].title).toBe('Test Event 1');
        expect(parsed[0].start).toBe('2026-01-15');
        expect(parsed[0].color).toBe(0);

        expect(parsed[1].title).toBe('Test Event 2|with pipes');
        expect(parsed[1].color).toBe(2);
        expect(parsed[1].id).not.toBe('2'); // Should generate a new UUID
    });

    it('should skip malformed lines', () => {
        const malformed = "garbage\n2026-01-01 | not-a-date | 0 | Title\n2026-01-01 | 2026-01-02 | 1 | Real Event";
        const parsed = parseEvents(malformed);

        expect(parsed.length).toBe(1);
        expect(parsed[0].title).toBe('Real Event');
    });

    it('should handle empty input', () => {
        expect(parseEvents("").length).toBe(0);
        expect(parseEvents("\n\n").length).toBe(0);
    });
});
