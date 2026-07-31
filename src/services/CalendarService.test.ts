import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const importCalendarService = async () => {
    vi.resetModules();
    vi.stubEnv('VITE_GOOGLE_CALENDAR_CLIENT_ID', 'test-client-id');
    return import('./CalendarService');
};

/** Stands up a token client whose requestAccessToken resolves immediately. */
const stubGoogleIdentity = (response: Record<string, unknown> = { access_token: 'granted-token', expires_in: 3600 }) => {
    const requestAccessToken = vi.fn();
    const initTokenClient = vi.fn((config: { callback: (res: unknown) => void }) => {
        requestAccessToken.mockImplementation(() => config.callback(response));
        return { requestAccessToken };
    });

    window.google = { accounts: { oauth2: { initTokenClient } } } as typeof window.google;
    return { initTokenClient, requestAccessToken };
};

const okResponse = (body: unknown) => ({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body)
});

describe('CalendarService', () => {
    beforeEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
        sessionStorage.clear();
        delete window.google;
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
        sessionStorage.clear();
        delete window.google;
    });

    it('requests the read-only scope', async () => {
        const { GOOGLE_CALENDAR_SCOPE } = await importCalendarService();
        expect(GOOGLE_CALENDAR_SCOPE).toBe('https://www.googleapis.com/auth/calendar.readonly');
    });

    it('passes login_hint and a blank prompt when asking for a token', async () => {
        const { CalendarService, GOOGLE_CALENDAR_SCOPE } = await importCalendarService();
        const { initTokenClient, requestAccessToken } = stubGoogleIdentity();

        const service = new CalendarService();
        await expect(service.requestAccessToken('user@example.com')).resolves.toBe('granted-token');

        expect(initTokenClient).toHaveBeenCalledWith(expect.objectContaining({
            client_id: 'test-client-id',
            scope: GOOGLE_CALENDAR_SCOPE,
            include_granted_scopes: true,
            prompt: '',
            login_hint: 'user@example.com'
        }));
        expect(requestAccessToken).toHaveBeenCalledWith({ prompt: '' });
    });

    it('reuses a token stored in sessionStorage across instances', async () => {
        const { CalendarService } = await importCalendarService();
        stubGoogleIdentity();

        const first = new CalendarService();
        await first.requestAccessToken('user@example.com');

        // A reload - or an iOS PWA restore - builds a fresh instance.
        const second = new CalendarService();
        expect(second.hasValidToken()).toBe(true);
    });

    it('coalesces concurrent token requests into one popup', async () => {
        const { CalendarService } = await importCalendarService();
        const { initTokenClient } = stubGoogleIdentity();

        const service = new CalendarService();
        await Promise.all([
            service.requestAccessToken('user@example.com'),
            service.requestAccessToken('user@example.com')
        ]);

        expect(initTokenClient).toHaveBeenCalledTimes(1);
    });

    it('rejects with an authorization error when Google declines', async () => {
        const { CalendarAuthorizationRequiredError, CalendarService } = await importCalendarService();
        stubGoogleIdentity({ error: 'access_denied', error_description: 'Denied' });

        const service = new CalendarService();
        await expect(service.requestAccessToken('user@example.com'))
            .rejects.toBeInstanceOf(CalendarAuthorizationRequiredError);
    });

    it('does not open Google Identity Services for API calls without a token', async () => {
        const { CalendarAuthorizationRequiredError, CalendarService } = await importCalendarService();
        const { initTokenClient } = stubGoogleIdentity();

        const service = new CalendarService();
        await expect(service.listCalendars()).rejects.toBeInstanceOf(CalendarAuthorizationRequiredError);
        expect(initTokenClient).not.toHaveBeenCalled();
    });

    it('lists events for a bounded range and drops cancelled ones', async () => {
        const { CalendarService } = await importCalendarService();
        stubGoogleIdentity();
        const fetchMock = vi.fn().mockResolvedValue(okResponse({
            items: [
                { id: 'a', summary: 'Kept' },
                { id: 'b', summary: 'Gone', status: 'cancelled' }
            ]
        }));
        vi.stubGlobal('fetch', fetchMock);

        const service = new CalendarService();
        await service.requestAccessToken('user@example.com');

        const events = await service.listEvents('cal-1', '2026-01-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z');

        expect(events.map((event) => event.id)).toEqual(['a']);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toContain('/calendars/cal-1/events');
        expect(url).toContain('singleEvents=true');
        expect(url).toContain('timeMin=2026-01-01');
        expect(url).toContain('timeMax=2027-01-01');
        expect(init.headers.Authorization).toBe('Bearer granted-token');
    });

    it('follows pagination', async () => {
        const { CalendarService } = await importCalendarService();
        stubGoogleIdentity();
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(okResponse({ items: [{ id: 'a' }], nextPageToken: 'page-2' }))
            .mockResolvedValueOnce(okResponse({ items: [{ id: 'b' }] }));
        vi.stubGlobal('fetch', fetchMock);

        const service = new CalendarService();
        await service.requestAccessToken('user@example.com');

        const calendars = await service.listCalendars();

        expect(calendars.map((calendar) => calendar.id)).toEqual(['a', 'b']);
        expect(fetchMock.mock.calls[1][0]).toContain('pageToken=page-2');
    });

    it('drops a token the API rejected with 401', async () => {
        const { CalendarService } = await importCalendarService();
        stubGoogleIdentity();
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: false,
            status: 401,
            text: () => Promise.resolve('{"error":{"message":"Invalid Credentials"}}')
        }));

        const service = new CalendarService();
        await service.requestAccessToken('user@example.com');
        expect(service.hasValidToken()).toBe(true);

        await expect(service.listCalendars()).rejects.toMatchObject({ status: 401 });
        expect(service.hasValidToken()).toBe(false);
    });

    it('classifies Google Calendar rate-limit errors from API JSON', async () => {
        const { CalendarApiError, CalendarService, isCalendarRateLimitError } = await importCalendarService();
        stubGoogleIdentity();
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: false,
            status: 403,
            text: () => Promise.resolve(JSON.stringify({
                error: {
                    errors: [{ domain: 'usageLimits', reason: 'rateLimitExceeded', message: 'Rate Limit Exceeded' }],
                    code: 403,
                    message: 'Rate Limit Exceeded'
                }
            }))
        }));

        const service = new CalendarService();
        await service.requestAccessToken('user@example.com');

        try {
            await service.listCalendars();
            expect.unreachable('listCalendars should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(CalendarApiError);
            expect(isCalendarRateLimitError(err)).toBe(true);
        }
    });
});
