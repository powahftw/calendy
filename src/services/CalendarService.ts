const CALENDAR_READ_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const GOOGLE_IDENTITY_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
const GOOGLE_CALENDAR_CLIENT_ID = import.meta.env.VITE_GOOGLE_CALENDAR_CLIENT_ID?.trim() || '';

export const isGoogleCalendarImportConfigured = GOOGLE_CALENDAR_CLIENT_ID.length > 0;

interface GoogleTokenResponse {
    access_token?: string;
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
        throw new Error('Google Calendar import is only available in the browser.');
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
    summary: string;
    start: { dateTime?: string; date?: string };
    end: { dateTime?: string; date?: string };
}

export class CalendarService {
    private token: string | null = null;

    async authenticate(): Promise<string> {
        if (!isGoogleCalendarImportConfigured) {
            throw new Error('Google Calendar import is not configured.');
        }

        const google = await loadGoogleIdentityApi();

        return new Promise((resolve, reject) => {
            const tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: GOOGLE_CALENDAR_CLIENT_ID,
                scope: CALENDAR_READ_SCOPE,
                include_granted_scopes: false,
                prompt: 'select_account',
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

            tokenClient.requestAccessToken({ prompt: 'select_account' });
        });
    }

    async listCalendars(): Promise<GoogleCalendar[]> {
        if (!this.token) throw new Error('Not authenticated');

        const response = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
            headers: { Authorization: `Bearer ${this.token}` }
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error('Calendar API Error:', response.status, errorBody);
            throw new Error(`Failed to list calendars: ${response.status} ${errorBody}`);
        }

        const data = await response.json();
        return (data.items || []).map((item: any) => ({
            id: item.id,
            summary: item.summary,
            primary: item.primary,
            backgroundColor: item.backgroundColor
        }));
    }

    async listEvents(calendarId: string): Promise<GoogleEvent[]> {
        if (!this.token) throw new Error('Not authenticated');

        const startOfCurrentYear = new Date(new Date().getFullYear(), 0, 1);
        const nextYear = new Date(startOfCurrentYear);
        nextYear.setFullYear(startOfCurrentYear.getFullYear() + 1);

        const params = new URLSearchParams({
            timeMin: startOfCurrentYear.toISOString(),
            timeMax: nextYear.toISOString(),
            singleEvents: 'true',
            orderBy: 'startTime',
            maxResults: '2500' // Reasonable limit
        });

        const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`, {
            headers: { Authorization: `Bearer ${this.token}` }
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Failed to list events: ${response.status} ${errorBody}`);
        }

        const data = await response.json();
        return data.items || [];
    }

    static getDurationInHours(event: GoogleEvent): number {
        const start = event.start.dateTime ? new Date(event.start.dateTime) : new Date(event.start.date!);
        const end = event.end.dateTime ? new Date(event.end.dateTime) : new Date(event.end.date!);

        // Handle all-day events (often just dates without times)
        // If it's pure dates, the difference might be exactly 24h, 48h etc.

        const diffMs = end.getTime() - start.getTime();
        return diffMs / (1000 * 60 * 60);
    }
}
