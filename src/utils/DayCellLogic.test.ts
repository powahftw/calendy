
import { describe, it, expect } from 'vitest';
import { getDisplayEvent, PlannerEvent, TRANSPARENT_COLOR_INDEX } from './calendarUtils';

describe('getDisplayEvent', () => {
    const baseEvent: PlannerEvent = {
        id: '1',
        title: 'Event 1',
        start: '2023-10-10',
        end: '2023-10-10',
        color: 1
    };

    it('should return the single event if only one exists', () => {
        const events = [baseEvent];
        const result = getDisplayEvent(events);
        expect(result).toBeDefined();
        expect(result!).toEqual(baseEvent);
    });

    it('should prioritize the first event with an icon', () => {
        const event1: PlannerEvent = { ...baseEvent, id: '1', icon: undefined };
        const event2: PlannerEvent = { ...baseEvent, id: '2', icon: '🎨' };
        const event3: PlannerEvent = { ...baseEvent, id: '3', icon: '⚽' };

        const events = [event1, event2, event3];
        const result = getDisplayEvent(events);

        expect(result).toBeDefined();
        expect(result!.icon).toBe('🎨');
        expect(result!.id).toBe('1'); // Should still assume identity of first event
    });

    it('should prioritize the first non-transparent color', () => {
        const event1: PlannerEvent = { ...baseEvent, id: '1', color: TRANSPARENT_COLOR_INDEX };
        const event2: PlannerEvent = { ...baseEvent, id: '2', color: 2 }; // Some solid color

        const events = [event1, event2];
        const result = getDisplayEvent(events);

        expect(result).toBeDefined();
        expect(result!.color).toBe(2);
    });

    it('should keep first event text and id', () => {
        const event1: PlannerEvent = { ...baseEvent, id: '1', title: 'Text 1', color: TRANSPARENT_COLOR_INDEX };
        const event2: PlannerEvent = { ...baseEvent, id: '2', title: 'Text 2', color: 2 };

        const events = [event1, event2];
        const result = getDisplayEvent(events);

        expect(result).toBeDefined();
        expect(result!.title).toBe('Text 1');
        expect(result!.id).toBe('1');
    });

    it('should handle complex scenario from user request', () => {
        // [No background] [Text1] [ No Icon] -> Transparent, Text1, No Icon
        // [No Background] [No text] [Icon1] -> Transparent, No Text, Icon1
        // [Bg blue] [[Text2] [IIcon 2] -> Blue, Text2, Icon2

        // Expected: [Bg blue] [Text 1][Icon 1]

        const event1: PlannerEvent = {
            id: '1', title: 'Text 1', start: '2023-10-10', end: '2023-10-10',
            color: TRANSPARENT_COLOR_INDEX
        };
        const event2: PlannerEvent = {
            id: '2', title: '', start: '2023-10-10', end: '2023-10-10',
            color: TRANSPARENT_COLOR_INDEX,
            icon: 'Icon1'
        };
        const event3: PlannerEvent = {
            id: '3', title: 'Text 2', start: '2023-10-10', end: '2023-10-10',
            color: 1, // Blue
            icon: 'Icon2'
        };

        const events = [event1, event2, event3];
        const result = getDisplayEvent(events);

        expect(result).toBeDefined();
        expect(result!.title).toBe('Text 1');
        expect(result!.icon).toBe('Icon1');
        expect(result!.color).toBe(1);
    });

    it('should return undefined or handle empty events', () => {
        const events: PlannerEvent[] = [];
        const result = getDisplayEvent(events);
        expect(result).toBeUndefined();
    });

    it('should preserve text from other events if first event has no title', () => {
        const iconEvent: PlannerEvent = {
            id: '1', title: '', start: '2023-10-10', end: '2023-10-10',
            color: TRANSPARENT_COLOR_INDEX,
            icon: '❓'
        };
        const textEvent: PlannerEvent = {
            id: '2', title: 'Hi', start: '2023-10-10', end: '2023-10-10',
            color: 1 // Blue
        };

        // If the icon event is first (e.g. dragged on top)
        const events = [iconEvent, textEvent];
        const result = getDisplayEvent(events);

        expect(result).toBeDefined();
        expect(result!.icon).toBe('❓');
        expect(result!.color).toBe(1);
        expect(result!.title).toBe('Hi'); // This is expected to fail currently
    });
});
