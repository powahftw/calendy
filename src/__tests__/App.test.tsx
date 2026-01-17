import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../App';
import LoginScreen from '../LoginScreen';
import { PlannerProvider } from '../context/PlannerContext';
import PlannerView from '../components/PlannerView';
import { vi, describe, it, expect } from 'vitest';

// Mock Firebase
vi.mock('../firebase', () => ({
    auth: {
        currentUser: null,
        signOut: vi.fn(),
    },
    provider: {},
    signInWithPopup: vi.fn(),
    signOut: vi.fn(),
}));

// Mock react-firebase-hooks
vi.mock('react-firebase-hooks/auth', () => ({
    useAuthState: () => [null, false, null] // Always null user
}));

// Mock AuthContext
vi.mock('../AuthContext', () => ({
    useAuth: () => ({
        user: null,
        loading: false,
        signOut: vi.fn(),
        signInWithGoogle: vi.fn(),
    }),
    AuthProvider: ({ children }: any) => <div>{children}</div>
}));

// Mock firestoreSync
vi.mock('../firestoreSync', () => ({
    syncEvents: vi.fn(),
    subscribeToEvents: () => vi.fn(),
    loadEvents: vi.fn(async () => []),
    syncSettings: vi.fn(),
    subscribeToSettings: () => vi.fn(),
    loadSettings: vi.fn(async () => ({})),
}));

// Mock matchMedia is in setup

describe('App Components', () => {

    it('renders LoginScreen initially', () => {
        render(<App />);
        expect(screen.getByText(/Continue as Guest/i)).toBeInTheDocument();
    });

    it('renders PlannerView with Provider', async () => {
        // Manually testing the authenticated/guest view
        const mockUser = null; // Guest
        const mockSignOut = vi.fn();
        const mockSetIsGuest = vi.fn();

        render(
            <PlannerProvider user={mockUser}>
                <PlannerView
                    user={mockUser}
                    signOut={mockSignOut}
                    isGuest={true}
                    setIsGuest={mockSetIsGuest}
                />
            </PlannerProvider>
        );

        // Verify header (Year)
        const currentYear = 2026; // Default in PlannerContext
        expect(screen.getByText(currentYear.toString())).toBeInTheDocument();

        // Verify Grid is present (check for a day)
        // Find Jan 15 (month 0, day 15)
        const dayCell = screen.getAllByText('15')[0].closest('.day-cell');
        expect(dayCell).toBeInTheDocument();

        // Test Interaction
        // Click a day (MouseDown + MouseUp sequence triggers the planner selection logic)
        fireEvent.mouseDown(dayCell!);
        fireEvent.mouseUp(dayCell!);

        // Expect Modal/Inputs
        // findBy naturally waits for the element to appear
        const titleInput = await screen.findByPlaceholderText(/Event Name/i);
        expect(titleInput).toBeInTheDocument();
    });

});

describe('App Integration', () => {

    it('allows guest login and adds an event', async () => {
        render(<App />);

        // 1. Login as guest
        const guestBtn = screen.getByText(/Continue as Guest/i);
        fireEvent.click(guestBtn);

        // 2. Wait for Planner load
        const currentYear = 2026;
        await waitFor(() => {
            expect(screen.getByText(currentYear.toString())).toBeInTheDocument();
        }, { timeout: 2000 });

        // 3. Click Day 15 to open modal
        const dayCells = screen.getAllByText('15');
        const dayCell = dayCells[0].closest('.day-cell');
        fireEvent.mouseDown(dayCell!);
        fireEvent.mouseUp(dayCell!);

        // 4. Fill Modal
        const titleInput = await screen.findByPlaceholderText(/Event Name/i);
        fireEvent.change(titleInput, { target: { value: 'Test Event' } });

        // 5. Save
        const saveBtn = screen.getByText(/Save/i);
        fireEvent.click(saveBtn);

        // 6. Verify Event on Grid
        await waitFor(() => {
            expect(screen.getByText('Test Event')).toBeInTheDocument();
        });
    });

    it('toggles progress display in header', async () => {
        render(<App />);
        fireEvent.click(screen.getByText(/Continue as Guest/i));

        const progressEl = await screen.findByTitle(/Click to toggle %/i);
        const initialText = progressEl.textContent;
        expect(initialText).toContain('/');

        fireEvent.click(progressEl);
        expect(progressEl.textContent).toMatch(/\d+(\.\d+)?%/);

        fireEvent.click(progressEl);
        expect(progressEl.textContent).toBe(initialText);
    });

    it('handles overlapping events', async () => {
        render(<App />);
        fireEvent.click(screen.getByText(/Continue as Guest/i));

        const dayCells = screen.getAllByText('20');
        const dayCell = dayCells[0].closest('.day-cell');

        // Create first event
        fireEvent.mouseDown(dayCell!); fireEvent.mouseUp(dayCell!);
        fireEvent.change(await screen.findByPlaceholderText(/Event Name/i), { target: { value: 'Event 1' } });
        fireEvent.click(screen.getByText(/Save/i));

        // Create second event on same day
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument()); // Wait for first modal to close
        fireEvent.mouseDown(dayCell!); fireEvent.mouseUp(dayCell!);
        fireEvent.change(await screen.findByPlaceholderText(/Event Name/i), { target: { value: 'Event 2' } });
        fireEvent.click(screen.getByText(/Save/i));

        // Wait for Grid update
        await screen.findByText('Event 1');

        // Event 2 should be in overflow lines
        const overflow = dayCell?.querySelector('.event-overflow');
        expect(overflow).toBeInTheDocument();
    });

});
