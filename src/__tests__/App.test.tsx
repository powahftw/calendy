import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import App from '../App';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { User } from 'firebase/auth';

// Mock Firebase
vi.mock('../firebase', () => ({
    db: {},
    auth: {},
    googleProvider: {}
}));

// Mock react-firebase-hooks
const mockUseAuthState = vi.fn(() => [null, false, null]);
vi.mock('react-firebase-hooks/auth', () => ({
    useAuthState: () => mockUseAuthState()
}));

// Mock AuthContext
const mockAuthValue = {
    user: null as User | null,
    loading: false,
    signOut: vi.fn(),
    signInWithGoogle: vi.fn(),
};
const mockUseAuth = vi.fn(() => mockAuthValue);
vi.mock('../AuthContext', () => ({
    useAuth: () => mockUseAuth(),
    AuthProvider: ({ children }: any) => <div>{children}</div>
}));

// Mock firestoreSync
const mockSyncEvents = vi.fn();
const mockLoadEvents = vi.fn().mockResolvedValue(null);
const mockSubscribeToEvents = vi.fn().mockReturnValue(() => { });
const mockSyncSettings = vi.fn();
const mockLoadSettings = vi.fn().mockResolvedValue(null);
const mockSubscribeToSettings = vi.fn().mockReturnValue(() => { });

vi.mock('../firestoreSync', () => ({
    syncEvents: (...args: any[]) => mockSyncEvents(...args),
    subscribeToEvents: (...args: any[]) => mockSubscribeToEvents(...args),
    loadEvents: (...args: any[]) => mockLoadEvents(...args),
    syncSettings: (...args: any[]) => mockSyncSettings(...args),
    subscribeToSettings: (...args: any[]) => mockSubscribeToSettings(...args),
    loadSettings: (...args: any[]) => mockLoadSettings(...args),
}));

// Mock matchMedia is in setup
vi.setConfig({ testTimeout: 15000 });

const waitForPlanner = async () => {
    // Wait for the year and at least one day cell to appear
    await screen.findByText('2026', {}, { timeout: 15000 });
    await screen.findAllByText('15', {}, { timeout: 15000 });
};

describe('App Integration', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
        mockAuthValue.user = null;
        mockAuthValue.loading = false;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('renders LoginScreen initially', async () => {
        render(<App />);
        expect(await screen.findByText(/Continue with Google/i, {}, { timeout: 10000 })).toBeInTheDocument();
    });

    it('renders PlannerView with Provider', async () => {
        mockAuthValue.user = { uid: 'test-user' } as User;
        render(<App />);
        await waitForPlanner();
    });

    it('allows guest login and adds an event', async () => {
        render(<App />);
        const guestBtn = await screen.findByText(/Continue as Guest/i);
        fireEvent.click(guestBtn);

        await waitForPlanner();

        const dayCells = screen.getAllByText('15');
        const dayCell = dayCells[0].closest('.day-cell');
        fireEvent.mouseDown(dayCell!);
        fireEvent.mouseUp(dayCell!);

        const titleInput = await screen.findByPlaceholderText(/Event Name/i);
        fireEvent.change(titleInput, { target: { value: 'My Test Event' } });

        const saveBtn = screen.getByText(/Save/i);
        fireEvent.click(saveBtn);

        expect(await screen.findByText('My Test Event', {}, { timeout: 10000 })).toBeInTheDocument();
    });

    it('handles overlapping events', async () => {
        mockAuthValue.user = { uid: 'test-user' } as User;
        render(<App />);
        await waitForPlanner();

        const dayCells = screen.getAllByText('15');
        const dayCell = dayCells[0].closest('.day-cell');

        fireEvent.mouseDown(dayCell!); fireEvent.mouseUp(dayCell!);
        fireEvent.change(await screen.findByPlaceholderText(/Event Name/i), { target: { value: 'Event 1' } });
        fireEvent.click(screen.getByText(/Save/i));

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        fireEvent.mouseDown(dayCell!); fireEvent.mouseUp(dayCell!);
        fireEvent.change(await screen.findByPlaceholderText(/Event Name/i), { target: { value: 'Event 2' } });
        fireEvent.click(screen.getByText(/Save/i));

        expect(await screen.findByText('Event 1', {}, { timeout: 10000 })).toBeInTheDocument();

        const overflow = dayCell?.querySelector('.event-overflow');
        expect(overflow).toBeInTheDocument();
    });

    it('renders special event styles (striped) and emoji events', async () => {
        mockAuthValue.user = { uid: 'test-user' } as User;
        render(<App />);
        await waitForPlanner();

        // 1. Create Striped Event
        const dayCells = screen.getAllByText('15');
        const dayCell = dayCells[0].closest('.day-cell');

        fireEvent.mouseDown(dayCell!); fireEvent.mouseUp(dayCell!);

        const titleInput = await screen.findByPlaceholderText(/Event Name/i);
        fireEvent.change(titleInput, { target: { value: 'Striped Event' } });

        // Select 6th color (Index 5 - Striped)
        const colorOptions = screen.getByText('Save').parentElement?.parentElement?.querySelectorAll('.color-circle');
        fireEvent.click(colorOptions![5]);

        fireEvent.click(screen.getByRole('button', { name: /Save/i }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

        const stripedEvent = await screen.findByText('Striped Event');
        const chip = stripedEvent.closest('.event-chip-common');
        expect(chip).toHaveClass('event-striped');

        // 2. Create Transparent Icon Event (Flag Only)
        fireEvent.mouseDown(dayCell!); fireEvent.mouseUp(dayCell!);

        await screen.findByPlaceholderText(/Event Name/i); // Wait for modal

        // Click cycle button to select Swiss Flag (index 1 in ['', '🇨🇭', ...])
        const cycleBtn = screen.getByTitle('Cycle Icon');
        fireEvent.click(cycleBtn); // 1st click -> 🇨🇭

        // Verify icon updated in UI (SVG renders with label)
        expect(screen.getByLabelText('Switzerland')).toBeInTheDocument();

        // Select 8th color (Index 7 - Transparent)
        // Need to re-query color options as modal refreshed
        const colorOptions2 = screen.getByText('Save').parentElement?.parentElement?.querySelectorAll('.color-circle');
        fireEvent.click(colorOptions2![7]);

        fireEvent.click(screen.getByRole('button', { name: /Save/i }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument(), { timeout: 3000 });

        const swissFlag = await screen.findByLabelText('Switzerland', {}, { timeout: 3000 });
        const transparentChip = swissFlag.closest('.event-chip-common');
        expect(transparentChip).toHaveClass('event-transparent');

        // 3. Create Icon + Text Event on a DIFFERENT day (day 16) to avoid overflow
        const dayCells16 = screen.getAllByText('16');
        const dayCell16 = dayCells16[0].closest('.day-cell');
        fireEvent.mouseDown(dayCell16!); fireEvent.mouseUp(dayCell16!);

        const titleInput3 = await screen.findByPlaceholderText(/Event Name/i);
        fireEvent.change(titleInput3, { target: { value: 'Trip to Italy' } });

        const cycleBtn2 = screen.getByTitle('Cycle Icon');
        fireEvent.click(cycleBtn2); // 1st click -> 🇨🇭
        fireEvent.click(cycleBtn2); // 2nd click -> 🇮🇹

        fireEvent.click(screen.getByRole('button', { name: /Save/i }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument(), { timeout: 5000 });

        const italianFlag = await screen.findByLabelText('Italy', {}, { timeout: 5000 });
        const textElement = await screen.findByText('Trip to Italy', {}, { timeout: 5000 });
        const normalChip = textElement.closest('.event-chip-common');

        expect(italianFlag).toBeInTheDocument();
        expect(textElement).toBeInTheDocument();
        expect(normalChip).not.toHaveClass('event-transparent');
    });
});

describe('Storage Persistence', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
        mockAuthValue.user = null;
        mockAuthValue.loading = false;
    });

    afterEach(() => {
        localStorage.clear();
    });

    it('should auto-activate guest mode when guest events exist in localStorage', async () => {
        const events = [{ id: '1', title: 'Test Event', start: '2026-01-15', end: '2026-01-15', color: 0 }];
        const state = {
            data: {
                events,
                settings: {
                    theme: 'blue',
                    highlightToday: true,
                    showWeekends: true,
                    showDayProgress: true,
                    weekdayAlign: true,
                    year: 2026,
                    monthsToShow: 12
                }
            },
            updatedAt: Date.now()
        };
        localStorage.setItem('planner_v2_guest', JSON.stringify(state));

        render(<App />);

        expect(await screen.findByText('Test Event', {}, { timeout: 10000 })).toBeInTheDocument();
        expect(screen.queryByText(/Continue as Guest/i)).not.toBeInTheDocument();
    });

    it('should use separate storage keys for different users', async () => {
        const user1 = { uid: 'user-1' } as User;
        const user2 = { uid: 'user-2' } as User;

        const state1 = {
            data: {
                events: [{ id: '1', title: 'User 1 Event', start: '2026-01-15', end: '2026-01-15', color: 0 }],
                settings: { theme: 'blue', year: 2026, monthsToShow: 12 }
            },
            updatedAt: Date.now()
        };
        localStorage.setItem('planner_v2_user-1', JSON.stringify(state1));

        mockAuthValue.user = user1;
        const { rerender } = render(<App />);

        expect(await screen.findByText('User 1 Event', {}, { timeout: 10000 })).toBeInTheDocument();

        mockAuthValue.user = user2;
        rerender(<App />);

        await waitFor(() => {
            expect(screen.queryByText('User 1 Event')).not.toBeInTheDocument();
        }, { timeout: 10000 });
    });
});

describe('Firebase Sync Logic', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
        mockAuthValue.user = null;
    });

    it('should load remote events when remote timestamp is newer', async () => {
        const user = { uid: 'test-user' } as User;
        const now = Date.now();

        const localState = {
            data: {
                events: [{ id: '1', title: 'Local Event', start: '2026-01-15', end: '2026-01-15', color: 0 }],
                settings: { theme: 'blue', year: 2026, monthsToShow: 12 }
            },
            updatedAt: now - 10000
        };
        localStorage.setItem('planner_v2_test-user', JSON.stringify(localState));

        mockLoadEvents.mockResolvedValue({
            events: [{ id: '2', title: 'Remote Event', start: '2026-01-16', end: '2026-01-16', color: 1 }],
            updatedAt: now
        });

        // ...


        mockAuthValue.user = user;
        render(<App />);

        // Wait for App to mount and Planner to show up (initial local data)
        await waitForPlanner();

        // Now wait for the useEffect async load to resolve and update state
        await waitFor(async () => {
            expect(await screen.findByText('Remote Event')).toBeInTheDocument();
        }, { timeout: 10000 });

        expect(screen.queryByText('Local Event')).not.toBeInTheDocument();
    });

    it('should override local events with empty remote state if remote is newer (deletion sync)', async () => {
        const user = { uid: 'test-user' } as User;
        const now = Date.now();

        const localState = {
            data: {
                events: [{ id: '1', title: 'Local Event', start: '2026-01-15', end: '2026-01-15', color: 0 }],
                settings: { theme: 'blue', year: 2026, monthsToShow: 12 }
            },
            updatedAt: now - 5000
        };
        localStorage.setItem('planner_v2_test-user', JSON.stringify(localState));

        mockLoadEvents.mockImplementation(async () => {
            await new Promise(resolve => setTimeout(resolve, 100));
            return {
                events: [],
                updatedAt: now
            };
        });

        mockAuthValue.user = user;
        render(<App />);

        // Should initially show local event
        expect(await screen.findByText('Local Event')).toBeInTheDocument();

        // Then it should be cleared when remote data (which is newer and empty) arrives
        await waitFor(() => {
            expect(screen.queryByText('Local Event')).not.toBeInTheDocument();
        }, { timeout: 10000 });
    });

    it('should ignore remote updates when local is newer', async () => {
        const user = { uid: 'test-user' } as User;
        let subscriptionCallback: any = null;

        mockSubscribeToEvents.mockImplementation((uid: string, callback: any) => {
            subscriptionCallback = callback;
            return () => { };
        });

        const now = Date.now();
        const localState = {
            data: {
                events: [{ id: '1', title: 'Local Event', start: '2026-01-15', end: '2026-01-15', color: 0 }],
                settings: { theme: 'blue', year: 2026, monthsToShow: 12 }
            },
            updatedAt: now
        };
        localStorage.setItem('planner_v2_test-user', JSON.stringify(localState));

        mockAuthValue.user = user;
        render(<App />);

        expect(await screen.findByText('Local Event', {}, { timeout: 10000 })).toBeInTheDocument();

        await act(async () => {
            subscriptionCallback?.({
                events: [],
                updatedAt: now - 10000
            });
        });

        expect(screen.getByText('Local Event')).toBeInTheDocument();
    });

    it('should debounce Firebase sync on rapid changes', async () => {
        const user = { uid: 'test-user' } as User;

        mockAuthValue.user = user;
        render(<App />);

        // Wait for initial render with real timers
        await waitForPlanner();

        // Switch to fake timers
        vi.useFakeTimers();

        for (let i = 0; i < 3; i++) {
            // Use getBy to be synchronous and rely on the fact that waitForPlanner ensured elements are there
            const dayCells = screen.getAllByText('15');
            const dayCell = dayCells[0].closest('.day-cell');

            fireEvent.mouseDown(dayCell!);
            fireEvent.mouseUp(dayCell!);

            // Synchronous query - modal should be open immediately on mouseUp
            const titleInput = screen.getByPlaceholderText(/Event Name/i);
            fireEvent.change(titleInput, { target: { value: `Event ${i}` } });

            const saveBtn = screen.getByText(/Save/i);
            fireEvent.click(saveBtn);

            // Allow immediate effects (like modal closing) to process
            // advancing by a small amount safely handles any immediate timeouts without triggering the sync (300ms)
            await act(async () => {
                vi.advanceTimersByTime(50);
            });
        }

        expect(mockSyncEvents).not.toHaveBeenCalled();

        await act(async () => {
            vi.advanceTimersByTime(2000);
        });

        expect(mockSyncEvents).toHaveBeenCalled();

        vi.useRealTimers();
    });
});

describe('Multi-Device Sync', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
        mockAuthValue.user = null;
    });

    it('should preserve events after tab close and reopen', async () => {
        const user = { uid: 'test-user' } as User;
        mockAuthValue.user = user;

        const { unmount } = render(<App />);
        expect(await screen.findByText('2026', {}, { timeout: 10000 })).toBeInTheDocument();

        const dayCells = screen.getAllByText('15');
        const dayCell = dayCells[0].closest('.day-cell');
        fireEvent.mouseDown(dayCell!); fireEvent.mouseUp(dayCell!);

        const titleInput = await screen.findByPlaceholderText(/Event Name/i);
        fireEvent.change(titleInput, { target: { value: 'Persisted Event' } });
        fireEvent.click(screen.getByText(/Save/i));

        expect(await screen.findByText('Persisted Event', {}, { timeout: 10000 })).toBeInTheDocument();

        // Wait for debounced localStorage write (50ms) to complete
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 100));
        });

        unmount();
        render(<App />);

        expect(await screen.findByText('Persisted Event', {}, { timeout: 10000 })).toBeInTheDocument();
    });
});

describe('Edge Cases', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
        mockAuthValue.user = null;
    });

    it('should handle corrupted localStorage gracefully', async () => {
        localStorage.setItem('planner_v2_guest', 'invalid json {{{');
        render(<App />);
        // The app detects guest usage intent (via item presence) and defaults to empty state if parse fails
        await waitForPlanner();
    });

    it('should handle Firebase load errors and continue with local data', async () => {
        const user = { uid: 'test-user' } as User;
        const state = {
            data: {
                events: [{ id: '1', title: 'Local Only Event', start: '2026-01-15', end: '2026-01-15', color: 0 }],
                settings: { theme: 'blue', year: 2026, monthsToShow: 12 }
            },
            updatedAt: Date.now()
        };
        localStorage.setItem('planner_v2_test-user', JSON.stringify(state));

        mockLoadEvents.mockRejectedValue(new Error('Network error'));
        mockAuthValue.user = user;
        render(<App />);

        expect(await screen.findByText('Local Only Event', {}, { timeout: 10000 })).toBeInTheDocument();
    });
});

