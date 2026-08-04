import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarEvent } from '../utils/calendarEvents';

const {
    serverTimestampSentinel,
    subscribeToEventStyleOverrides,
    syncEventStyleOverrides
} = vi.hoisted(() => ({
    serverTimestampSentinel: Symbol('serverTimestamp'),
    subscribeToEventStyleOverrides: vi.fn(),
    syncEventStyleOverrides: vi.fn()
}));

vi.mock('firebase/firestore', () => ({
    serverTimestamp: vi.fn(() => serverTimestampSentinel)
}));

vi.mock('../firestoreSync', () => ({
    subscribeToEventStyleOverrides,
    syncEventStyleOverrides
}));

import { useEventStyleOverrides } from './useEventStyleOverrides';

const event = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
    id: 'instance-1',
    title: 'Trip',
    start: '2026-07-14',
    end: '2026-07-16',
    allDay: true,
    styleKey: 'series-1',
    automaticColor: 0,
    color: 0,
    ...overrides
});

const storageState = () => JSON.parse(
    localStorage.getItem('calendy_event_styles_v1_travel-cal') || '{}'
);

describe('useEventStyleOverrides', () => {
    let remoteUpdate: (value: { styles: Record<string, number>; updatedAt: number }) => void;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-01T12:00:00Z'));
        localStorage.clear();
        subscribeToEventStyleOverrides.mockReset();
        syncEventStyleOverrides.mockReset();
        subscribeToEventStyleOverrides.mockImplementation((_uid, _calendarId, callback) => {
            remoteUpdate = callback;
            return vi.fn();
        });
        syncEventStyleOverrides.mockResolvedValue(true);
    });

    afterEach(() => vi.useRealTimers());

    it('stores immediately, styles the whole series, and syncs once after the debounce', async () => {
        const source = [event(), event({ id: 'instance-2', start: '2026-07-21', end: '2026-07-23' })];
        const { result } = renderHook(() => useEventStyleOverrides('user-1', 'travel-cal', source));

        act(() => result.current.cycleEventStyle(result.current.events[0]));

        expect(result.current.events.map((item) => item.color)).toEqual([1, 1]);
        expect(storageState()).toMatchObject({
            styles: { 'series-1': 1 },
            pendingSync: true
        });
        expect(syncEventStyleOverrides).not.toHaveBeenCalled();

        await act(() => vi.advanceTimersByTimeAsync(650));

        expect(syncEventStyleOverrides).toHaveBeenCalledTimes(1);
        expect(syncEventStyleOverrides).toHaveBeenCalledWith(
            'user-1',
            'travel-cal',
            { 'series-1': 1 },
            serverTimestampSentinel
        );
        expect(storageState().pendingSync).toBe(false);
    });

    it('syncs an empty map after cycling back to automatic', async () => {
        const { result } = renderHook(() => useEventStyleOverrides('user-1', 'travel-cal', [event()]));

        for (let i = 0; i < 8; i += 1) {
            act(() => result.current.cycleEventStyle(result.current.events[0]));
        }

        expect(result.current.events[0].color).toBe(0);
        expect(storageState()).toMatchObject({ styles: {}, pendingSync: true });

        await act(() => vi.advanceTimersByTimeAsync(650));
        expect(syncEventStyleOverrides).toHaveBeenCalledWith(
            'user-1',
            'travel-cal',
            {},
            serverTimestampSentinel
        );
    });

    it('applies a newer remote style and writes it through to the local cache', () => {
        const { result } = renderHook(() => useEventStyleOverrides('user-1', 'travel-cal', [event()]));

        act(() => remoteUpdate({ styles: { 'series-1': 6 }, updatedAt: Date.now() + 1000 }));

        expect(result.current.events[0].color).toBe(6);
        expect(storageState()).toMatchObject({
            styles: { 'series-1': 6 },
            pendingSync: false
        });
    });

    it('treats Firestore as authoritative when the local cache has no pending edit', () => {
        localStorage.setItem('calendy_event_styles_v1_travel-cal', JSON.stringify({
            styles: { 'series-1': 2 },
            updatedAt: Date.now() + 60_000,
            pendingSync: false
        }));
        const { result } = renderHook(() => useEventStyleOverrides('user-1', 'travel-cal', [event()]));

        act(() => remoteUpdate({ styles: { 'series-1': 6 }, updatedAt: Date.now() }));

        expect(result.current.events[0].color).toBe(6);
        expect(storageState()).toMatchObject({ styles: { 'series-1': 6 }, pendingSync: false });
    });

    it('does not let an older remote snapshot overwrite a pending local edit', () => {
        const { result } = renderHook(() => useEventStyleOverrides('user-1', 'travel-cal', [event()]));

        act(() => result.current.cycleEventStyle(result.current.events[0]));
        const localUpdatedAt = storageState().updatedAt;
        act(() => remoteUpdate({ styles: { 'series-1': 6 }, updatedAt: localUpdatedAt - 1 }));

        expect(result.current.events[0].color).toBe(1);
        expect(storageState().pendingSync).toBe(true);
    });

    it('reconciles a newer pending edit from another tab and syncs it', async () => {
        const { result } = renderHook(() => useEventStyleOverrides('user-1', 'travel-cal', [event()]));
        const incoming = {
            styles: { 'series-1': 4 },
            updatedAt: Date.now() + 1,
            pendingSync: true
        };
        localStorage.setItem('calendy_event_styles_v1_travel-cal', JSON.stringify(incoming));

        act(() => window.dispatchEvent(new StorageEvent('storage', {
            key: 'calendy_event_styles_v1_travel-cal',
            newValue: JSON.stringify(incoming),
            storageArea: localStorage
        })));

        expect(result.current.events[0].color).toBe(4);
        await act(() => vi.advanceTimersByTimeAsync(650));
        expect(syncEventStyleOverrides).toHaveBeenCalledWith(
            'user-1',
            'travel-cal',
            { 'series-1': 4 },
            serverTimestampSentinel
        );
    });

    it('keeps a newer edit pending when an older in-flight write completes', async () => {
        let finishFirstSync!: (value: boolean) => void;
        syncEventStyleOverrides.mockImplementationOnce(() => new Promise((resolve) => {
            finishFirstSync = resolve;
        }));
        const { result } = renderHook(() => useEventStyleOverrides('user-1', 'travel-cal', [event()]));

        act(() => result.current.cycleEventStyle(result.current.events[0]));
        await act(() => vi.advanceTimersByTimeAsync(650));
        act(() => result.current.cycleEventStyle(result.current.events[0]));
        await act(async () => finishFirstSync(true));

        expect(result.current.events[0].color).toBe(2);
        expect(storageState()).toMatchObject({
            styles: { 'series-1': 2 },
            pendingSync: true
        });
    });

    it('migrates the original local format and queues it for Firestore', () => {
        localStorage.setItem('calendy_event_styles_v1_travel-cal', JSON.stringify({ 'series-1': 5 }));

        const { result } = renderHook(() => useEventStyleOverrides('user-1', 'travel-cal', [event()]));

        expect(result.current.events[0].color).toBe(5);
        expect(storageState()).toMatchObject({
            styles: { 'series-1': 5 },
            pendingSync: true
        });
    });
});
