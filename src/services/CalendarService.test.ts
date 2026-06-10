import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const importCalendarService = async () => {
    vi.resetModules();
    vi.stubEnv('VITE_GOOGLE_CALENDAR_CLIENT_ID', 'test-client-id');
    return import('./CalendarService');
};

const seedToken = async (service: { requestInteractiveToken: (hint: string) => Promise<string> }, token: string) => {
    window.google = {
        accounts: {
            oauth2: {
                initTokenClient: (config) => ({
                    requestAccessToken: () => {
                        config.callback({ access_token: token, expires_in: 3600 });
                    }
                })
            }
        }
    };
    await service.requestInteractiveToken('user@example.com');
    delete window.google;
};

describe('CalendarService authorization', () => {
    beforeEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
        delete window.google;
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
        delete window.google;
    });

    it('uses a seeded token for API calls without opening Google Identity Services', async () => {
        const { CalendarService } = await importCalendarService();
        const service = new CalendarService();
        await seedToken(service, 'seeded-token');
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ items: [] })
        });
        vi.stubGlobal('fetch', fetchMock);

        await expect(service.listEvents('calendar-id')).resolves.toEqual([]);

        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('/calendars/calendar-id/events'),
            expect.objectContaining({
                headers: expect.objectContaining({
                    Authorization: 'Bearer seeded-token'
                })
            })
        );
    });

    it('passes login_hint and a blank prompt for explicit interactive token requests', async () => {
        const { CalendarService, GOOGLE_CALENDAR_SCOPE } = await importCalendarService();
        const requestAccessToken = vi.fn();
        const initTokenClient = vi.fn((config) => {
            requestAccessToken.mockImplementation(() => {
                config.callback({ access_token: 'interactive-token', expires_in: 3600 });
            });
            return { requestAccessToken };
        });
        window.google = {
            accounts: {
                oauth2: {
                    initTokenClient
                }
            }
        };

        const service = new CalendarService();
        await expect(service.requestInteractiveToken('user@example.com')).resolves.toBe('interactive-token');

        expect(initTokenClient).toHaveBeenCalledWith(expect.objectContaining({
            client_id: 'test-client-id',
            scope: GOOGLE_CALENDAR_SCOPE,
            include_granted_scopes: true,
            prompt: '',
            login_hint: 'user@example.com'
        }));
        expect(requestAccessToken).toHaveBeenCalledWith({ prompt: '' });
    });

    it('does not open Google Identity Services for background API calls without a token', async () => {
        const { CalendarAuthorizationRequiredError, CalendarService } = await importCalendarService();
        const initTokenClient = vi.fn();
        window.google = {
            accounts: {
                oauth2: {
                    initTokenClient
                }
            }
        };

        const service = new CalendarService();
        await expect(service.listEvents('calendar-id')).rejects.toBeInstanceOf(CalendarAuthorizationRequiredError);

        expect(initTokenClient).not.toHaveBeenCalled();
    });

    it('classifies Google Calendar rate-limit errors from API JSON', async () => {
        const { CalendarApiError, CalendarService, isCalendarRateLimitError } = await importCalendarService();
        const service = new CalendarService();
        await seedToken(service, 'seeded-token');
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

        await expect(service.listEvents('calendar-id')).rejects.toMatchObject({
            name: 'CalendarApiError',
            status: 403,
            reason: 'rateLimitExceeded',
            message: 'Rate Limit Exceeded'
        });

        try {
            await service.listEvents('calendar-id');
        } catch (err) {
            expect(err).toBeInstanceOf(CalendarApiError);
            expect(isCalendarRateLimitError(err)).toBe(true);
        }
    });
});
