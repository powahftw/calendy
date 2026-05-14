const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';
const GOOGLE_IDENTITY_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
const GOOGLE_CALENDAR_CLIENT_ID = import.meta.env.VITE_GOOGLE_CALENDAR_CLIENT_ID?.trim() || '';

export const isGoogleCalendarSyncConfigured = GOOGLE_CALENDAR_CLIENT_ID.length > 0;

interface GoogleTokenResponse {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
}

interface GoogleTokenError {
    type: 'popup_failed_to_open' | 'popup_closed' | 'unknown';
}

interface GoogleTokenClientConfig {
    client_id: string;
    scope: string;
    include_granted_scopes?: boolean;
    prompt?: string;
    callback: (response: GoogleTokenResponse) => void;
    error_callback?: (error: GoogleTokenError) => void;
}

interface GoogleTokenClient {
    requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
}

interface GoogleIdentityApi {
    accounts: {
        oauth2: {
            initTokenClient: (config: GoogleTokenClientConfig) => GoogleTokenClient;
        };
    };
}

declare global {
    interface Window {
        google?: GoogleIdentityApi;
    }
}

let googleIdentityScriptPromise: Promise<GoogleIdentityApi> | null = null;

const loadGoogleIdentityApi = async (): Promise<GoogleIdentityApi> => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
        throw new Error('Google Calendar sync is only available in the browser.');
    }

    if (window.google?.accounts?.oauth2) {
        return window.google;
    }

    if (!googleIdentityScriptPromise) {
        googleIdentityScriptPromise = new Promise((resolve, reject) => {
            const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_IDENTITY_SCRIPT_SRC}"]`);

            const handleLoad = () => {
                if (window.google?.accounts?.oauth2) {
                    resolve(window.google);
                    return;
                }

                googleIdentityScriptPromise = null;
                reject(new Error('Google Identity Services did not initialize.'));
            };

            const handleError = () => {
                googleIdentityScriptPromise = null;
                reject(new Error('Failed to load Google Identity Services.'));
            };

            if (existingScript) {
                existingScript.addEventListener('load', handleLoad, { once: true });
                existingScript.addEventListener('error', handleError, { once: true });
                return;
            }

            const script = document.createElement('script');
            script.src = GOOGLE_IDENTITY_SCRIPT_SRC;
            script.async = true;
            script.defer = true;
            script.addEventListener('load', handleLoad, { once: true });
            script.addEventListener('error', handleError, { once: true });
            document.head.appendChild(script);
        });
    }

    return googleIdentityScriptPromise;
};

export interface GoogleCalendar {
    id: string;
    summary: string;
    primary?: boolean;
    backgroundColor?: string;
}

export interface GoogleEvent {
    id: string;
    summary?: string;
    status?: 'confirmed' | 'tentative' | 'cancelled';
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
}

export interface GoogleEventsPage {
    items: GoogleEvent[];
    nextPageToken?: string;
}

export class CalendarApiError extends Error {
    status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = 'CalendarApiError';
        this.status = status;
    }
}

export class CalendarService {
    private token: string | null = null;
    private tokenExpiresAt = 0;

    async authenticate(options: { prompt?: '' | 'select_account' | 'consent' } = {}): Promise<string> {
        if (!isGoogleCalendarSyncConfigured) {
            throw new Error('Google Calendar sync is not configured.');
        }

        if (this.token && Date.now() < this.tokenExpiresAt - 60_000 && !options.prompt) {
            return this.token;
        }

        const google = await loadGoogleIdentityApi();
        const prompt = options.prompt ?? 'select_account';

        return new Promise((resolve, reject) => {
            const tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: GOOGLE_CALENDAR_CLIENT_ID,
                scope: CALENDAR_SCOPE,
                include_granted_scopes: false,
                prompt,
                callback: (response) => {
                    if (response.error) {
                        reject(new Error(response.error_description || response.error));
                        return;
                    }

                    if (!response.access_token) {
                        reject(new Error('No access token found.'));
                        return;
                    }

                    this.token = response.access_token;
                    this.tokenExpiresAt = Date.now() + (response.expires_in ?? 3600) * 1000;
                    resolve(this.token);
                },
                error_callback: (error) => {
                    if (error.type === 'popup_closed') {
                        reject(new Error('Google account picker was closed.'));
                        return;
                    }

                    if (error.type === 'popup_failed_to_open') {
                        reject(new Error('Google account picker could not be opened.'));
                        return;
                    }

                    reject(new Error('Google account picker failed.'));
                }
            });

            tokenClient.requestAccessToken({ prompt });
        });
    }

    private async request<T>(url: string, init: RequestInit = {}): Promise<T> {
        await this.authenticate({ prompt: '' });

        const response = await fetch(url, {
            ...init,
            headers: {
                ...(init.headers || {}),
                Authorization: `Bearer ${this.token}`
            }
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new CalendarApiError(response.status, errorBody || response.statusText);
        }

        if (response.status === 204) {
            return undefined as T;
        }

        return response.json();
    }

    async createCalendar(summary: string): Promise<GoogleCalendar> {
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const data = await this.request<GoogleCalendar>('https://www.googleapis.com/calendar/v3/calendars', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ summary, timeZone })
        });
        return data;
    }

    async listCalendars(): Promise<GoogleCalendar[]> {
        let pageToken: string | undefined;
        const calendars: GoogleCalendar[] = [];

        do {
            const params = new URLSearchParams({ maxResults: '250' });
            if (pageToken) params.set('pageToken', pageToken);

            const data = await this.request<{ items?: GoogleCalendar[]; nextPageToken?: string }>(
                `https://www.googleapis.com/calendar/v3/users/me/calendarList?${params}`
            );

            calendars.push(...(data.items || []));
            pageToken = data.nextPageToken;
        } while (pageToken);

        return calendars;
    }

    async listEvents(calendarId: string): Promise<GoogleEvent[]> {
        let pageToken: string | undefined;
        const events: GoogleEvent[] = [];

        do {
            const params = new URLSearchParams({
                singleEvents: 'true',
                maxResults: '2500'
            });

            if (pageToken) params.set('pageToken', pageToken);

            const data = await this.request<GoogleEventsPage>(
                `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`
            );

            events.push(...(data.items || []));
            pageToken = data.nextPageToken;
        } while (pageToken);

        return events;
    }

    async insertEvent(calendarId: string, event: { summary: string; start: string; end: string }): Promise<GoogleEvent> {
        return this.request<GoogleEvent>(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                summary: event.summary,
                start: { date: event.start },
                end: { date: event.end }
            })
        });
    }

    async patchEvent(calendarId: string, eventId: string, event: { summary: string; start: string; end: string }): Promise<GoogleEvent> {
        return this.request<GoogleEvent>(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
            {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    summary: event.summary,
                    start: { date: event.start },
                    end: { date: event.end }
                })
            }
        );
    }

    async deleteEvent(calendarId: string, eventId: string): Promise<void> {
        await this.request<void>(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
            { method: 'DELETE' }
        );
    }
}
