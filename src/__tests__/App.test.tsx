import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { User } from 'firebase/auth';
import App from '../App';
import type { GoogleCalendar, GoogleEvent } from '../services/CalendarService';
import { clearEventCache } from '../utils/eventCache';
import type { CalendarSelection } from '../firestoreSync';

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
    syncEventStyleOverrides: vi.fn().mockResolvedValue(true),
    subscribeToSettings: vi.fn().mockReturnValue(() => { }),
    subscribeToEventStyleOverrides: vi.fn().mockReturnValue(() => { }),
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
        id: 'hotel',
        summary: '🏨 Hotel do Mar',
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
    },
    {
        id: 'solo-all-day',
        summary: 'Solo holiday',
        start: { date: july(22) },
        end: { date: july(23) }
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

        it('shows one universal overlap count and reveals every event', async () => {
            render(<App />);
            await screen.findAllByText('Lisbon');

            // One primary chip stays compact; every other event contributes to +N.
            expect(screen.queryByText('🏨 Hotel do Mar')).not.toBeInTheDocument();
            const trigger = screen.getByRole('button', { name: /4 events on 14 Jul/i });
            expect(trigger).toHaveTextContent('+3');
            fireEvent.click(trigger);

            expect(await screen.findByText('🏨 Hotel do Mar')).toBeInTheDocument();
            expect(screen.getByText('All-day events')).toBeInTheDocument();
            expect(screen.getAllByText('14–16 Jul')).toHaveLength(2);
            expect(screen.getByText('✈️ FCO to LIS')).toBeInTheDocument();
        });

        it('shows a +1 trigger on a day containing only one timed event', async () => {
            render(<App />);

            const trigger = await screen.findByRole('button', { name: /1 event on 20 Jul/i });
            expect(trigger).toHaveTextContent('+1');
        });

        it('renders one all-day event directly without a redundant +1', async () => {
            render(<App />);

            const trigger = await screen.findByRole('button', { name: /1 event on 22 Jul/i });
            expect(trigger).toHaveTextContent('Solo holiday');
            expect(trigger).not.toHaveTextContent('+1');
        });

        it('cycles an event style from the popover and saves it locally', async () => {
            render(<App />);

            fireEvent.click(await screen.findByRole('button', { name: /4 events on 14 Jul/i }));
            const colorLine = await screen.findByRole('button', { name: /Cycle color for Lisbon/i });
            fireEvent.click(colorLine);

            expect(JSON.parse(localStorage.getItem('calendy_event_styles_v1_travel-cal') || '{}'))
                .toMatchObject({
                    styles: { trip: expect.any(Number) },
                    pendingSync: true
                });

            fireEvent.keyDown(document, { key: 'Escape' });
            await waitFor(() => {
                expect(screen.queryByRole('button', { name: /Cycle color for Lisbon/i })).not.toBeInTheDocument();
            });
        });

        it('hands the open hover card directly to another occupied day', async () => {
            render(<App />);

            const busyDay = await screen.findByRole('button', { name: /4 events on 14 Jul/i });
            const timedOnlyDay = screen.getByRole('button', { name: /1 event on 20 Jul/i });

            fireEvent.mouseEnter(busyDay);
            expect(await screen.findByText('🏨 Hotel do Mar')).toBeInTheDocument();

            fireEvent.mouseLeave(busyDay);
            fireEvent.mouseEnter(timedOnlyDay);

            expect(await screen.findByText('Dentist')).toBeInTheDocument();
            expect(screen.queryByText('🏨 Hotel do Mar')).not.toBeInTheDocument();
        });

        it('keeps the grid and offers to reconnect when the token has lapsed', async () => {
            hasToken = false;
            mockRequestAccessToken.mockRejectedValue(new Error('needs consent'));
            render(<App />);

            // The calendar is still chosen, so the picker must not take over.
            expect(await screen.findByText('Jul')).toBeInTheDocument();
            expect(screen.queryByText('Connect your calendar')).not.toBeInTheDocument();
            expect(screen.getByRole('button', { name: /^Reconnect$/i })).toBeInTheDocument();
        });

        it('offers export but not import or clear-all in settings', async () => {
            render(<App />);
            await screen.findAllByText('Lisbon');

            fireEvent.click(screen.getByRole('button', { name: /^Settings$/i }));

            expect(await screen.findByRole('button', { name: /Export Markdown/i })).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /^Import$/i })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /Clear All/i })).not.toBeInTheDocument();
        });
    });
});
