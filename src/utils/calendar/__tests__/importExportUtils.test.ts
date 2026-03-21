import { describe, it, expect } from 'vitest';
import {
    serializeEvents,
    parseEvents,
    EXPORT_SEPARATOR,
    isDuplicate,
    mergeImportedEvents
} from '../importExportUtils';
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

    it('should serialize events correctly with month headers', () => {
        const serialized = serializeEvents(mockEvents);

        expect(serialized).toContain('-- January 2026');
        expect(serialized).toContain('-- February 2026');
        expect(serialized).toContain(`2026-01-15 ${EXPORT_SEPARATOR} 2026-01-18 ${EXPORT_SEPARATOR} 0 ${EXPORT_SEPARATOR} Test Event 1`);
        expect(serialized).toContain(`2026-02-10 ${EXPORT_SEPARATOR} 2026-02-10 ${EXPORT_SEPARATOR} 2 ${EXPORT_SEPARATOR} Test Event 2 | with pipes`);
    });

    it('should parse serialized events correctly and sanitize titles', () => {
        const payload = "-- Header\n2026-01-01 | 2026-01-02 | 0 | <script>alert(1)</script>";
        const parsed = parseEvents(payload);

        expect(parsed.length).toBe(1);
        expect(parsed[0].title).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
        expect(parsed[0].start).toBe('2026-01-01');
    });

    it('should handle duplicate detection', () => {
        const existing: PlannerEvent[] = [mockEvents[0]];
        expect(isDuplicate(mockEvents[0], existing)).toBe(true);
        expect(isDuplicate(mockEvents[1], existing)).toBe(false);
    });

    it('should ignore color when checking import duplicates', () => {
        const existing: PlannerEvent[] = [mockEvents[0]];
        const recoloredEvent: PlannerEvent = {
            ...mockEvents[0],
            id: '3',
            color: 4
        };

        expect(isDuplicate(recoloredEvent, existing)).toBe(true);
    });

    it('should merge imports while skipping duplicates already present or repeated in the batch', () => {
        const existing: PlannerEvent[] = [mockEvents[0]];
        const duplicateInBatch: PlannerEvent = { ...mockEvents[1], id: '3' };
        const imported: PlannerEvent[] = [mockEvents[1], duplicateInBatch, { ...mockEvents[0], id: '4' }];

        const result = mergeImportedEvents(imported, existing);

        expect(result.uniqueEvents).toHaveLength(1);
        expect(result.duplicateCount).toBe(2);
        expect(result.mergedEvents).toHaveLength(2);
        expect(result.mergedEvents[1].title).toBe('Test Event 2 | with pipes');
    });

    it('should skip malformed lines and headers', () => {
        const malformed = "-- A Header Line\ngarbage line\n2026-01-01 | 2026-01-02 | 1 | Real Event";
        const parsed = parseEvents(malformed);

        expect(parsed.length).toBe(1);
        expect(parsed[0].title).toBe('Real Event');
    });

    it('should handle empty input', () => {
        expect(parseEvents("").length).toBe(0);
        expect(parseEvents("\n\n").length).toBe(0);
    });
});
