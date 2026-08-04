// Read-only access: Calendy can list the user's calendars and read their
// events, but can never create, modify or delete anything.
export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const GOOGLE_IDENTITY_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
const GOOGLE_CALENDAR_CLIENT_ID = import.meta.env.VITE_GOOGLE_CALENDAR_CLIENT_ID?.trim() || '';
const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

// Tokens live in sessionStorage so a reload - or an iOS PWA being evicted and
// restored - does not force a fresh consent popup within the same session.
const TOKEN_STORAGE_KEY = 'calendy_gcal_token';
// Treat a token as spent slightly early so an in-flight request cannot expire
// mid-flight.
const TOKEN_EXPIRY_SKEW_MS = 60_000;

export const isGoogleCalendarConfigured = GOOGLE_CALENDAR_CLIENT_ID.length > 0;

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
    login_hint?: string;
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
        throw new Error('Google Calendar access is only available in the browser.');
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

export const preloadGoogleIdentityApi = () => {
    if (!isGoogleCalendarConfigured) return;
    void loadGoogleIdentityApi().catch(() => {
        googleIdentityScriptPromise = null;
    });
};

export interface GoogleCalendar {
    id: string;
    summary: string;
    summaryOverride?: string;
    description?: string;
    primary?: boolean;
    selected?: boolean;
    accessRole?: string;
    backgroundColor?: string;
}

export interface GoogleEventDateTime {
    date?: string;
    dateTime?: string;
    timeZone?: string;
}

export interface GoogleEvent {
    id: string;
    iCalUID?: string;
    recurringEventId?: string;
    summary?: string;
    status?: 'confirmed' | 'tentative' | 'cancelled';
    colorId?: string;
    start?: GoogleEventDateTime;
    end?: GoogleEventDateTime;
}

interface GoogleListPage<T> {
    items?: T[];
    nextPageToken?: string;
}

const RATE_LIMIT_REASONS = new Set(['rateLimitExceeded', 'userRateLimitExceeded', 'quotaExceeded']);

const parseGoogleApiError = (status: number, errorBody: string) => {
    try {
        const parsed = JSON.parse(errorBody) as {
            error?: {
                message?: string;
                errors?: Array<{ reason?: string; message?: string }>;
            };
        };
        const firstError = parsed.error?.errors?.[0];
        return {
            message: parsed.error?.message || firstError?.message || errorBody,
            reason: firstError?.reason || (status === 429 ? 'rateLimitExceeded' : undefined)
        };
    } catch {
        return {
            message: errorBody,
            reason: status === 429 ? 'rateLimitExceeded' : undefined
        };
    }
};

export class CalendarApiError extends Error {
    status: number;
    reason?: string;

    constructor(status: number, message: string, reason?: string) {
        super(message);
        this.name = 'CalendarApiError';
        this.status = status;
        this.reason = reason;
    }
}

export const isCalendarRateLimitError = (err: unknown) => (
    err instanceof CalendarApiError
    && (err.status === 429 || (err.status === 403 && RATE_LIMIT_REASONS.has(err.reason ?? '')))
);

export class CalendarAuthorizationRequiredError extends Error {
    constructor(message = 'Google Calendar authorization is required.') {
        super(message);
        this.name = 'CalendarAuthorizationRequiredError';
    }
}

export const isCalendarAuthorizationError = (err: unknown) => (
    err instanceof CalendarAuthorizationRequiredError
    || (err instanceof CalendarApiError && (err.status === 401 || (err.status === 403 && !isCalendarRateLimitError(err))))
);

interface StoredToken {
    token: string;
    expiresAt: number;
}

const readStoredToken = (): StoredToken | null => {
    if (typeof sessionStorage === 'undefined') return null;

    try {
        const raw = sessionStorage.getItem(TOKEN_STORAGE_KEY);
        if (!raw) return null;

        const parsed = JSON.parse(raw) as Partial<StoredToken>;
        if (typeof parsed?.token !== 'string' || typeof parsed?.expiresAt !== 'number') return null;

        return { token: parsed.token, expiresAt: parsed.expiresAt };
    } catch {
        return null;
    }
};

const writeStoredToken = (stored: StoredToken | null) => {
    if (typeof sessionStorage === 'undefined') return;

    try {
        if (stored) {
            sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(stored));
        } else {
            sessionStorage.removeItem(TOKEN_STORAGE_KEY);
        }
    } catch {
        // Private-mode Safari throws on writes; the in-memory token still works
        // for the life of the page.
    }
};

export class CalendarService {
    private token: string | null = null;
    private tokenExpiresAt = 0;
    private pendingTokenRequest: Promise<string> | null = null;

    constructor() {
        const stored = readStoredToken();
        if (stored) {
            this.token = stored.token;
            this.tokenExpiresAt = stored.expiresAt;
        }
    }

    hasValidToken() {
        return Boolean(this.token && Date.now() < this.tokenExpiresAt - TOKEN_EXPIRY_SKEW_MS);
    }

    clearAccessToken() {
        this.token = null;
        this.tokenExpiresAt = 0;
        writeStoredToken(null);
    }

    private setAccessToken(token: string, expiresInSeconds: number) {
        this.token = token;
        this.tokenExpiresAt = Date.now() + expiresInSeconds * 1000;
        writeStoredToken({ token, expiresAt: this.tokenExpiresAt });
    }

    /**
     * Requests a token from Google Identity Services.
     *
     * `prompt: ''` lets Google reuse an existing session and previously granted
     * scopes without showing UI, which is what makes the silent path work. It
     * can still open a popup when consent has lapsed, so callers that are not
     * responding to a user gesture should treat a rejection as "reconnect
     * needed" rather than retrying.
     */
    async requestAccessToken(loginHint?: string): Promise<string> {
        if (!isGoogleCalendarConfigured) {
            throw new Error('Google Calendar access is not configured.');
        }

        if (this.hasValidToken()) {
            return this.token!;
        }

        // Coalesce concurrent callers so a burst of fetches triggers one popup.
        // The marker has to be set before the first await, or two callers both
        // get past this check while the GIS script is still loading.
        if (this.pendingTokenRequest) {
            return this.pendingTokenRequest;
        }

        this.pendingTokenRequest = this.requestFreshToken(loginHint).finally(() => {
            this.pendingTokenRequest = null;
        });

        return this.pendingTokenRequest;
    }

    private async requestFreshToken(loginHint?: string): Promise<string> {
        const google = await loadGoogleIdentityApi();

        return new Promise<string>((resolve, reject) => {
            const tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: GOOGLE_CALENDAR_CLIENT_ID,
                scope: GOOGLE_CALENDAR_SCOPE,
                include_granted_scopes: true,
                prompt: '',
                login_hint: loginHint,
                callback: (response) => {
                    if (response.error) {
                        reject(new CalendarAuthorizationRequiredError(response.error_description || response.error));
                        return;
                    }

                    if (!response.access_token) {
                        reject(new CalendarAuthorizationRequiredError('No access token found.'));
                        return;
                    }

                    this.setAccessToken(response.access_token, response.expires_in ?? 3600);
                    resolve(response.access_token);
                },
                error_callback: (error) => {
                    if (error.type === 'popup_closed') {
                        reject(new CalendarAuthorizationRequiredError('Google Calendar authorization was closed.'));
                        return;
                    }

                    if (error.type === 'popup_failed_to_open') {
                        reject(new CalendarAuthorizationRequiredError('Google Calendar authorization could not be opened.'));
                        return;
                    }

                    reject(new CalendarAuthorizationRequiredError('Google Calendar authorization failed.'));
                }
            });

            tokenClient.requestAccessToken({ prompt: '' });
        });
    }

    private async request<T>(url: string): Promise<T> {
        if (!this.hasValidToken()) {
            throw new CalendarAuthorizationRequiredError();
        }

        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${this.token}` }
        });

        if (!response.ok) {
            const errorBody = await response.text();
            const parsedError = parseGoogleApiError(response.status, errorBody || response.statusText);

            // A rejected token is dead regardless of our local expiry estimate.
            if (response.status === 401) {
                this.clearAccessToken();
            }

            throw new CalendarApiError(response.status, parsedError.message, parsedError.reason);
        }

        return response.json();
    }

    private async requestAllPages<T>(url: string, params: URLSearchParams): Promise<T[]> {
        const items: T[] = [];
        let pageToken: string | undefined;

        do {
            const pageParams = new URLSearchParams(params);
            if (pageToken) pageParams.set('pageToken', pageToken);

            const data = await this.request<GoogleListPage<T>>(`${url}?${pageParams}`);
            items.push(...(data.items || []));
            pageToken = data.nextPageToken;
        } while (pageToken);

        return items;
    }

    async listCalendars(): Promise<GoogleCalendar[]> {
        const params = new URLSearchParams({
            maxResults: '250',
            minAccessRole: 'reader',
            showHidden: 'true'
        });

        return this.requestAllPages<GoogleCalendar>(`${CALENDAR_API_BASE}/users/me/calendarList`, params);
    }

    /**
     * Lists events between two ISO-8601 instants, expanding recurring events
     * into their individual occurrences.
     */
    async listEvents(calendarId: string, timeMin: string, timeMax: string): Promise<GoogleEvent[]> {
        const params = new URLSearchParams({
            singleEvents: 'true',
            orderBy: 'startTime',
            showDeleted: 'false',
            maxResults: '2500',
            timeMin,
            timeMax
        });

        const events = await this.requestAllPages<GoogleEvent>(
            `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
            params
        );

        return events.filter((event) => event.status !== 'cancelled');
    }
}

/**
 * Shared instance so every hook sees the same token state; without it two
 * hooks would each think they need their own authorization popup.
 */
export const calendarService = new CalendarService();
