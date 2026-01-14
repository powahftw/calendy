import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '../firebase';

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly';
const CALENDAR_READ_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

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
        const provider = new GoogleAuthProvider();
        provider.addScope(CALENDAR_SCOPE);
        provider.addScope(CALENDAR_READ_SCOPE);

        try {
            const result = await signInWithPopup(auth, provider);
            const credential = GoogleAuthProvider.credentialFromResult(result);
            this.token = credential?.accessToken || null;

            if (!this.token) {
                throw new Error("No access token found");
            }
            return this.token;
        } catch (error) {
            console.error("Error authenticating for calendar:", error);
            throw error;
        }
    }

    async listCalendars(): Promise<GoogleCalendar[]> {
        if (!this.token) throw new Error("Not authenticated");

        const response = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
            headers: { Authorization: `Bearer ${this.token}` }
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error('Calendar API Error:', response.status, errorBody);
            throw new Error(`Failed to list calendars: ${response.status} ${errorBody}`);
        }

        const data = await response.json();
        return data.items.map((item: any) => ({
            id: item.id,
            summary: item.summary,
            primary: item.primary,
            backgroundColor: item.backgroundColor
        }));
    }

    async listEvents(calendarId: string): Promise<GoogleEvent[]> {
        if (!this.token) throw new Error("Not authenticated");

        const now = new Date();
        const nextYear = new Date();
        nextYear.setFullYear(now.getFullYear() + 1);

        const params = new URLSearchParams({
            timeMin: now.toISOString(),
            timeMax: nextYear.toISOString(),
            singleEvents: 'true',
            orderBy: 'startTime',
            maxResults: '2500' // Reasonable limit
        });

        const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`, {
            headers: { Authorization: `Bearer ${this.token}` }
        });

        if (!response.ok) throw new Error("Failed to list events");

        const data = await response.json();
        return data.items || [];
        // Filtering will be done in the UI/Logic layer to allow flexibility
    }

    // Helper to calculate duration in hours
    static getDurationInHours(event: GoogleEvent): number {
        const start = event.start.dateTime ? new Date(event.start.dateTime) : new Date(event.start.date!);
        const end = event.end.dateTime ? new Date(event.end.dateTime) : new Date(event.end.date!);

        // Handle all-day events (often just dates without times)
        // If it's pure dates, the difference might be exactly 24h, 48h etc.

        const diffMs = end.getTime() - start.getTime();
        return diffMs / (1000 * 60 * 60);
    }
}

export const calendarService = new CalendarService();
