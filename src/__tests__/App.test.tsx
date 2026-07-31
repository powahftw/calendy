import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { User } from 'firebase/auth';
import App from '../App';
import type { GoogleCalendar, GoogleEvent } from '../services/CalendarService';
import { clearEventCache } from '../utils/eventCache';
import type { CalendarSelection } from '../utils/calendarSettings';

vi.mock('../firebase', () => ({
    db: {},
    auth: {},
    isFirebaseConfigured: true
}));

const mockAuthValue = {
    user: null as User | null,
    loading: false,
    isFirebaseAvailable: true,
    signOut: vi.fn(),
    signInWithGoogle: vi.fn(),
};
vi.mock('../AuthContext', () => ({
    useAuth: () => mockAuthValue,
    AuthProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));

let storedSelection: CalendarSelection | null = null;
const mockSaveCalendarSelection = vi.fn(async (_uid: string, selection: CalendarSelection) => {
    storedSelection = selection;
    return true;
});

vi.mock('../firestoreSync', () => ({
    syncSettings: vi.fn().mockResolvedValue(true),
    subscribeToSettings: vi.fn().mockReturnValue(() => { }),
    loadSettings: vi.fn().mockResolvedValue(null),
    subscribeToCalendarSelection: (_uid: string, callback: (s: CalendarSelection | null) => void) => {
        callback(storedSelection);
        return () => { };
    },
    saveCalendarSelection: (...args: [string, CalendarSelection]) => mockSaveCalendarSelection(...args),
}));

const CALENDARS: GoogleCalendar[] = [
    { id: 'primary-cal', summary: 'Federico', primary: true, backgroundColor: '#3b82f6' },
    { id: 'travel-cal', summary: 'Travel', backgroundColor: '#10b981' }
];

const YEAR = new Date().getFullYear();
const pad = (value: number) => String(value).padStart(2, '0');
const july = (day: number) => `${YEAR}-07-${pad(day)}`;

const GOOGLE_EVENTS: GoogleEvent[] = [
    {
        id: 'trip',
        summary: 'Lisbon',
        start: { date: july(14) },
        end: { date: july(17) }
    },
    {
        id: 'flight',
        summary: '✈️ FCO to LIS',
        start: { dateTime: `${july(14)}T06:40:00` },
        end: { dateTime: `${july(14)}T09:05:00` }
    },
    {
        id: 'train',
        summary: '🚆 Airport to town',
        start: { dateTime: `${july(14)}T11:15:00` },
        end: { dateTime: `${july(14)}T11:50:00` }
    },
    {
        id: 'dentist',
        summary: 'Dentist',
        start: { dateTime: `${july(20)}T10:00:00` },
        end: { dateTime: `${july(20)}T10:30:00` }
    }
];

const mockListCalendars = vi.fn(async () => CALENDARS);
const mockListEvents = vi.fn(async () => GOOGLE_EVENTS);
const mockRequestAccessToken = vi.fn(async (_loginHint?: string) => 'token');
let hasToken = true;

vi.mock('../services/CalendarService', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../services/CalendarService')>();
    return {
        ...actual,
        isGoogleCalendarConfigured: true,
        preloadGoogleIdentityApi: vi.fn(),
        calendarService: {
            hasValidToken: () => hasToken,
            clearAccessToken: vi.fn(() => { hasToken = false; }),
            requestAccessToken: (...args: [string?]) => mockRequestAccessToken(...args),
            listCalendars: () => mockListCalendars(),
            listEvents: () => mockListEvents(),
        },
    };
});

vi.setConfig({ testTimeout: 15000 });

const signedInUser = { uid: 'test-user', email: 'user@example.com', displayName: 'Fede' } as User;

describe('Calendy read-only planner', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
        clearEventCache();
        vi.clearAllMocks();
        mockAuthValue.user = null;
        mockAuthValue.loading = false;
        storedSelection = null;
        hasToken = true;
        mockListCalendars.mockResolvedValue(CALENDARS);
        mockListEvents.mockResolvedValue(GOOGLE_EVENTS);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('requires sign-in and offers no guest mode', async () => {
        render(<App />);

        expect(await screen.findByText(/Continue with Google/i)).toBeInTheDocument();
        expect(screen.queryByText(/Continue as Guest/i)).not.toBeInTheDocument();
    });

    it('asks which calendar to view before drawing the grid', async () => {
        mockAuthValue.user = signedInUser;
        render(<App />);

        expect(await screen.findByText('Choose a calendar')).toBeInTheDocument();
        expect(screen.getByText('Travel')).toBeInTheDocument();
        expect(screen.getByText('Primary')).toBeInTheDocument();
    });

    it('offers to connect when there is no calendar token yet', async () => {
        hasToken = false;
        mockRequestAccessToken.mockRejectedValueOnce(new Error('needs consent'));
        mockAuthValue.user = signedInUser;
        render(<App />);

        expect(await screen.findByText('Connect your calendar')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Connect Google Calendar/i })).toBeInTheDocument();
    });

    it('saves the picked calendar and renders the year', async () => {
        mockAuthValue.user = signedInUser;
        render(<App />);

        fireEvent.click(await screen.findByText('Travel'));

        await waitFor(() => {
            expect(mockSaveCalendarSelection).toHaveBeenCalledWith(
                'test-user',
                expect.objectContaining({ calendarId: 'travel-cal', calendarSummary: 'Travel' })
            );
        });

        expect(await screen.findByText('Jul')).toBeInTheDocument();
    });

    describe('with a calendar already selected', () => {
        beforeEach(() => {
            storedSelection = { calendarId: 'travel-cal', calendarSummary: 'Travel' };
            mockAuthValue.user = signedInUser;
        });

        it('renders a full-day event as a chip on every day it covers', async () => {
            render(<App />);

            // 14th to 16th inclusive: Google's exclusive end date is 17th.
            expect(await screen.findAllByText('Lisbon')).toHaveLength(3);
        });

        it('collapses the day\'s timed emoji events into one pill', async () => {
            render(<App />);

            const pill = await screen.findByRole('button', { name: /2 timed events on 14 Jul/i });
            expect(pill).toBeInTheDocument();
            // One pill for the day, not one per event.
            expect(screen.queryByRole('button', { name: /1 timed event on 14 Jul/i })).not.toBeInTheDocument();
        });

        it('reveals the grouped events when the pill is tapped, and hides them again', async () => {
            render(<App />);

            const pill = await screen.findByRole('button', { name: /2 timed events on 14 Jul/i });
            expect(screen.queryByText('✈️ FCO to LIS')).not.toBeInTheDocument();

            fireEvent.click(pill);

            expect(await screen.findByText('✈️ FCO to LIS')).toBeInTheDocument();
            expect(screen.getByText('🚆 Airport to town')).toBeInTheDocument();
            expect(screen.getByText('06:40–09:05')).toBeInTheDocument();

            fireEvent.keyDown(document, { key: 'Escape' });
            await waitFor(() => {
                expect(screen.queryByText('✈️ FCO to LIS')).not.toBeInTheDocument();
            });
        });

        it('leaves timed events without an emoji off the grid', async () => {
            render(<App />);
            await screen.findAllByText('Lisbon');

            expect(screen.queryByRole('button', { name: /timed event.* on 20 Jul/i })).not.toBeInTheDocument();
        });

        it('exposes no way to create, edit or delete an event', async () => {
            render(<App />);
            const [chip] = await screen.findAllByText('Lisbon');

            fireEvent.click(chip);

            expect(screen.queryByText(/New Event/i)).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument();
        });

        it('offers export but not import or clear-all in settings', async () => {
            render(<App />);
            await screen.findAllByText('Lisbon');

            fireEvent.click(screen.getByRole('button', { name: /^Settings$/i }));

            expect(await screen.findByRole('button', { name: /Export Markdown/i })).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /^Import$/i })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /Clear All/i })).not.toBeInTheDocument();
        });

        it('only fetches Google once for a cached year', async () => {
            const { unmount } = render(<App />);
            await screen.findAllByText('Lisbon');
            await waitFor(() => expect(mockListEvents).toHaveBeenCalledTimes(1));

            unmount();
            render(<App />);
            await screen.findAllByText('Lisbon');

            expect(mockListEvents).toHaveBeenCalledTimes(1);
        });
    });
});
