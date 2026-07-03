import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { User } from 'firebase/auth';
import { useGoogleCalendarSync } from './useGoogleCalendarSync';
import { PlannerEvent } from '../utils/calendarUtils';

const mocks = vi.hoisted(() => {
    class MockCalendarApiError extends Error {
        status: number;
        reason?: string;

        constructor(status: number, message: string, reason?: string) {
            super(message);
            this.name = 'CalendarApiError';
            this.status = status;
            this.reason = reason;
        }
    }

    const state: { googleSyncSettingsCallback: ((settings: any) => void) | null } = {
        googleSyncSettingsCallback: null
    };
    const saveGoogleSyncSettings = vi.fn();
    const subscribeToGoogleSyncSettings = vi.fn((_uid: string, callback: (settings: any) => void) => {
        state.googleSyncSettingsCallback = callback;
        return () => { };
    });
    const service = {
        hasValidToken: vi.fn(),
        clearAccessToken: vi.fn(),
        requestInteractiveToken: vi.fn(),
        getCalendar: vi.fn(),
        createCalendar: vi.fn(),
        listEvents: vi.fn(),
        insertEvent: vi.fn(),
        patchEvent: vi.fn(),
        deleteEvent: vi.fn()
    };

    return {
        MockCalendarApiError,
        saveGoogleSyncSettings,
        subscribeToGoogleSyncSettings,
        service,
        state
    };
});

vi.mock('../services/CalendarService', () => ({
    CalendarApiError: mocks.MockCalendarApiError,
    CalendarAuthorizationRequiredError: class CalendarAuthorizationRequiredError extends Error { },
    CalendarService: vi.fn(function CalendarService() {
        return mocks.service;
    }),
    isCalendarRateLimitError: (err: unknown) => (
        err instanceof mocks.MockCalendarApiError
        && (err.status === 429 || err.reason === 'rateLimitExceeded' || err.reason === 'userRateLimitExceeded' || err.reason === 'quotaExceeded')
    ),
    preloadGoogleIdentityApi: vi.fn()
}));

vi.mock('../firestoreSync', () => ({
    saveGoogleSyncSettings: (uid: string, settings: any) => mocks.saveGoogleSyncSettings(uid, settings),
    subscribeToGoogleSyncSettings: (uid: string, callback: (settings: any) => void) => mocks.subscribeToGoogleSyncSettings(uid, callback)
}));

const user = { uid: 'user-1', email: 'user@example.com' } as User;
const event: PlannerEvent = {
    id: 'event-1',
    title: 'Trip',
    start: '2026-05-10',
    end: '2026-05-10',
    color: 0
};

const renderGoogleSyncHook = (events: PlannerEvent[] = [event]) => renderHook(() => useGoogleCalendarSync(
    user,
    events,
    vi.fn(),
    vi.fn(),
    true
));

describe('useGoogleCalendarSync', () => {
    beforeEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
        vi.spyOn(console, 'info').mockImplementation(() => { });
        vi.spyOn(console, 'warn').mockImplementation(() => { });
        mocks.state.googleSyncSettingsCallback = null;
        mocks.saveGoogleSyncSettings.mockResolvedValue(true);
        mocks.service.hasValidToken.mockReturnValue(true);
        mocks.service.requestInteractiveToken.mockResolvedValue('token');
        mocks.service.getCalendar.mockResolvedValue({ id: 'calendar-id', summary: 'Calendy' });
        mocks.service.createCalendar.mockResolvedValue({ id: 'calendar-id', summary: 'Calendy' });
        mocks.service.listEvents.mockResolvedValue([]);
        mocks.service.insertEvent.mockResolvedValue({ id: 'gcal-event-1' });
        mocks.service.patchEvent.mockResolvedValue({ id: 'gcal-event-1' });
        mocks.service.deleteEvent.mockResolvedValue(undefined);
    });

    it('does not push all events immediately on reconnect', async () => {
        const { result } = renderGoogleSyncHook();

        await act(async () => {
            await expect(result.current.googleSync.setup()).resolves.toBe(true);
        });

        expect(mocks.saveGoogleSyncSettings).toHaveBeenCalledWith('user-1', expect.objectContaining({
            enabled: true,
            calendarId: 'calendar-id',
            accountEmail: 'user@example.com'
        }));
        expect(mocks.service.listEvents).not.toHaveBeenCalled();
        expect(mocks.service.insertEvent).not.toHaveBeenCalled();
        expect(mocks.service.patchEvent).not.toHaveBeenCalled();
        expect(mocks.service.deleteEvent).not.toHaveBeenCalled();
    });

    it('does not recover/create calendars when getCalendar is rate limited', async () => {
        mocks.service.getCalendar.mockRejectedValue(new mocks.MockCalendarApiError(403, 'Rate Limit Exceeded', 'rateLimitExceeded'));
        const { result } = renderGoogleSyncHook();

        act(() => {
            mocks.state.googleSyncSettingsCallback?.({
                enabled: true,
                calendarId: 'saved-calendar-id',
                accountEmail: 'user@example.com'
            });
        });

        await act(async () => {
            await expect(result.current.googleSync.setup()).resolves.toBe(false);
        });

        expect(mocks.service.getCalendar).toHaveBeenCalledWith('saved-calendar-id');
        expect(mocks.service.createCalendar).not.toHaveBeenCalled();
    });

    it('inserts directly instead of patching when a stored Google event id is missing', async () => {
        const { result } = renderGoogleSyncHook([{ ...event, gcalEventId: 'missing-google-event-id' }]);

        act(() => {
            mocks.state.googleSyncSettingsCallback?.({
                enabled: true,
                calendarId: 'calendar-id',
                accountEmail: 'user@example.com'
            });
        });

        await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(mocks.service.listEvents).toHaveBeenCalledWith('calendar-id');
        expect(mocks.service.patchEvent).not.toHaveBeenCalled();
        expect(mocks.service.insertEvent).toHaveBeenCalledTimes(1);
        expect(result.current.googleSync.error).toBeNull();
    });

    it('skips background sync when local events are unchanged after a successful sync', async () => {
        const { result } = renderGoogleSyncHook([{ ...event, gcalEventId: 'gcal-event-1' }]);
        mocks.service.listEvents.mockResolvedValue([{
            id: 'gcal-event-1',
            summary: 'Trip',
            start: { date: '2026-05-10' },
            end: { date: '2026-05-11' },
            status: 'confirmed'
        }]);

        act(() => {
            mocks.state.googleSyncSettingsCallback?.({
                enabled: true,
                calendarId: 'calendar-id',
                accountEmail: 'user@example.com'
            });
        });

        await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(mocks.service.listEvents).toHaveBeenCalledTimes(1);

        await act(async () => {
            await result.current.googleSync.syncNow();
        });

        expect(mocks.service.listEvents).toHaveBeenCalledTimes(2);

        act(() => {
            window.dispatchEvent(new Event('focus'));
        });

        await act(async () => {
            await Promise.resolve();
        });

        expect(mocks.service.listEvents).toHaveBeenCalledTimes(2);
    });

    it('stops background sync while rate-limit cooldown is active', async () => {
        vi.useFakeTimers();
        vi.spyOn(Math, 'random').mockReturnValue(0);
        mocks.service.listEvents.mockRejectedValue(new mocks.MockCalendarApiError(403, 'Rate Limit Exceeded', 'rateLimitExceeded'));
        const { result } = renderGoogleSyncHook();

        act(() => {
            mocks.state.googleSyncSettingsCallback?.({
                enabled: true,
                calendarId: 'calendar-id',
                accountEmail: 'user@example.com'
            });
        });

        await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(mocks.service.listEvents).toHaveBeenCalledTimes(1);

        await act(async () => {
            await result.current.googleSync.syncNow();
        });

        expect(mocks.service.listEvents).toHaveBeenCalledTimes(1);
        expect(result.current.googleSync.error).toMatch(/rate limiting sync/i);

        vi.clearAllTimers();
    });
});
