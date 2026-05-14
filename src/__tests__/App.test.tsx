import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import App from '../App';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { User } from 'firebase/auth';
import { STRIPED_COLOR_INDEX, TRANSPARENT_COLOR_INDEX } from '../utils/calendarUtils';
import { STORAGE_PREFIX } from '../utils/persistence';
import { EVENT_ICONS } from '../components/EventModal';

// Mock Firebase
vi.mock('../firebase', () => ({
    db: {},
    auth: {},
    isFirebaseConfigured: true
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
    isFirebaseAvailable: true,
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
const mockSubscribeToGoogleSyncSettings = vi.fn().mockReturnValue(() => { });
const mockSaveGoogleSyncSettings = vi.fn().mockResolvedValue(true);

vi.mock('../firestoreSync', () => ({
    syncEvents: (...args: any[]) => mockSyncEvents(...args),
    subscribeToEvents: (...args: any[]) => mockSubscribeToEvents(...args),
    loadEvents: (...args: any[]) => mockLoadEvents(...args),
    syncSettings: (...args: any[]) => mockSyncSettings(...args),
    subscribeToSettings: (...args: any[]) => mockSubscribeToSettings(...args),
    loadSettings: (...args: any[]) => mockLoadSettings(...args),
    subscribeToGoogleSyncSettings: (...args: any[]) => mockSubscribeToGoogleSyncSettings(...args),
    saveGoogleSyncSettings: (...args: any[]) => mockSaveGoogleSyncSettings(...args),
}));

// Mock matchMedia is in setup
vi.setConfig({ testTimeout: 15000 });

const waitForPlanner = async () => {
    // Wait for the year and at least one day cell to appear
    await screen.findByText(String(new Date().getFullYear()), {}, { timeout: 15000 });
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


    it('scrolls back to today when the button is clicked', async () => {
        const scrollMock = vi.fn();
        window.HTMLElement.prototype.scrollIntoView = scrollMock;

        render(<App />);
        const guestBtn = await screen.findByText(/Continue as Guest/i);
        fireEvent.click(guestBtn);

        await waitForPlanner();

        expect(screen.queryByTitle('Back to Today')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Next range/i }));

        await waitFor(() => {
            expect(screen.getByTitle('Back to Today')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByTitle('Back to Today'));

        await waitFor(() => {
            expect(scrollMock).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center', inline: 'center' });
            expect(screen.queryByTitle('Back to Today')).not.toBeInTheDocument();
        });
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
        fireEvent.click(colorOptions![STRIPED_COLOR_INDEX]);

        fireEvent.click(screen.getByRole('button', { name: /Save/i }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

        const stripedEvent = await screen.findByText('Striped Event');
        const chip = stripedEvent.closest('.event-chip-common');
        expect(chip).toHaveClass('event-striped');

        // 2. Create Transparent Icon Event (Flag Only) on day 17 to avoid overflow
        const dayCells17 = screen.getAllByText('17');
        const dayCell17 = dayCells17[0].closest('.day-cell');
        fireEvent.mouseDown(dayCell17!); fireEvent.mouseUp(dayCell17!);

        await screen.findByPlaceholderText(/Event Name/i); // Wait for modal

        // Click cycle button to select Swiss Flag (index 5 in ['', '⚠️', '❓', '🌍', '🗺️', '🇨🇭', ...])
        const cycleBtn = screen.getByTitle('Cycle Icon');
        for (let i = 0; i < EVENT_ICONS.indexOf('🇨🇭'); i++) fireEvent.click(cycleBtn);

        // Verify icon updated in UI
        expect(screen.getByText('🇨🇭')).toBeInTheDocument();

        // Select 8th color (Index 7 - Transparent)
        // Need to re-query color options as modal refreshed
        const colorOptions2 = screen.getByText('Save').parentElement?.parentElement?.querySelectorAll('.color-circle');
        fireEvent.click(colorOptions2![TRANSPARENT_COLOR_INDEX]);

        fireEvent.click(screen.getByRole('button', { name: /Save/i }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument(), { timeout: 3000 });

        const swissFlag = await screen.findByText('🇨🇭', {}, { timeout: 3000 });
        const transparentChip = swissFlag.closest('.event-chip-common');
        expect(transparentChip).toHaveClass('event-transparent');

        // 3. Create Icon + Text Event on a DIFFERENT day (day 16) to avoid overflow
        const dayCells16 = screen.getAllByText('16');
        const dayCell16 = dayCells16[0].closest('.day-cell');
        fireEvent.mouseDown(dayCell16!); fireEvent.mouseUp(dayCell16!);

        const titleInput3 = await screen.findByPlaceholderText(/Event Name/i);
        fireEvent.change(titleInput3, { target: { value: 'Trip to Italy' } });

        const cycleBtn2 = screen.getByTitle('Cycle Icon');
        for (let i = 0; i < 6; i++) fireEvent.click(cycleBtn2); // 6 clicks -> 🇮🇹

        fireEvent.click(screen.getByRole('button', { name: /Save/i }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument(), { timeout: 5000 });

        const italianFlag = await screen.findByText('🇮🇹', {}, { timeout: 5000 });
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
                    startMonth: 0,
                    monthsToShow: 12
                }
            },
            updatedAt: Date.now()
        };
        localStorage.setItem(`${STORAGE_PREFIX}guest`, JSON.stringify(state));

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
                settings: { theme: 'blue', year: 2026, startMonth: 0, monthsToShow: 12 }
            },
            updatedAt: Date.now()
        };
        localStorage.setItem(`${STORAGE_PREFIX}user-1`, JSON.stringify(state1));

        mockAuthValue.user = user1;
        const { rerender } = render(<App />);

        expect(await screen.findByText('User 1 Event', {}, { timeout: 10000 })).toBeInTheDocument();

        mockAuthValue.user = user2;
        rerender(<App />);

        await waitFor(() => {
            expect(screen.queryByText('User 1 Event')).not.toBeInTheDocument();
        }, { timeout: 10000 });
    });

    it('should sync local-only changes across tabs via storage events', async () => {
        render(<App />);
        fireEvent.click(await screen.findByText(/Continue as Guest/i));
        await waitForPlanner();

        const incomingState = {
            data: {
                events: [{ id: '1', title: 'Cross Tab Event', start: '2026-01-15', end: '2026-01-15', color: 0 }],
                settings: {
                    theme: 'blue',
                    highlightToday: true,
                    showWeekends: true,
                    showDayProgress: true,
                    weekdayAlign: true,
                    year: 2026,
                    startMonth: 0,
                    monthsToShow: 12
                }
            },
            updatedAt: 1000,
            timestamps: {
                events: 1000,
                settings: 1000
            },
            pendingSyncSlices: {
                events: false,
                settings: false
            }
        };

        await act(async () => {
            window.dispatchEvent(new StorageEvent('storage', {
                key: `${STORAGE_PREFIX}guest`,
                newValue: JSON.stringify(incomingState),
                storageArea: window.localStorage
            }));
        });

        expect(await screen.findByText('Cross Tab Event', {}, { timeout: 10000 })).toBeInTheDocument();
    });

    it('should merge only the newer localStorage slice from another tab', async () => {
        render(<App />);
        fireEvent.click(await screen.findByText(/Continue as Guest/i));
        await waitForPlanner();

        const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(2000);

        const dayCells = screen.getAllByText('15');
        const dayCell = dayCells[0].closest('.day-cell');
        fireEvent.mouseDown(dayCell!);
        fireEvent.mouseUp(dayCell!);

        const titleInput = await screen.findByPlaceholderText(/Event Name/i);
        fireEvent.change(titleInput, { target: { value: 'Local Event' } });
        fireEvent.click(screen.getByText(/Save/i));

        expect(await screen.findByText('Local Event')).toBeInTheDocument();
        dateNowSpy.mockRestore();

        const incomingState = {
            data: {
                events: [],
                settings: {
                    theme: 'dark',
                    highlightToday: true,
                    showWeekends: true,
                    showDayProgress: true,
                    weekdayAlign: true,
                    year: 2026,
                    startMonth: 0,
                    monthsToShow: 12
                }
            },
            updatedAt: 1500,
            timestamps: {
                events: 1000,
                settings: 1500
            },
            pendingSyncSlices: {
                events: false,
                settings: false
            }
        };

        await act(async () => {
            window.dispatchEvent(new StorageEvent('storage', {
                key: `${STORAGE_PREFIX}guest`,
                newValue: JSON.stringify(incomingState),
                storageArea: window.localStorage
            }));
        });

        await waitFor(() => {
            expect(document.body.getAttribute('data-theme')).toBe('dark');
        });
        expect(screen.getByText('Local Event')).toBeInTheDocument();
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
                settings: { theme: 'blue', year: 2026, startMonth: 0, monthsToShow: 12 }
            },
            updatedAt: now - 10000
        };
        localStorage.setItem(`${STORAGE_PREFIX}test-user`, JSON.stringify(localState));

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
        type EmptyRemoteEventsPayload = {
            events: {
                id: string;
                title: string;
                start: string;
                end: string;
                color: number;
            }[];
            updatedAt: number;
        };
        let resolveRemoteEvents: ((value: EmptyRemoteEventsPayload) => void) | null = null;

        const localState = {
            data: {
                events: [{ id: '1', title: 'Local Event', start: '2026-01-15', end: '2026-01-15', color: 0 }],
                settings: { theme: 'blue', year: 2026, startMonth: 0, monthsToShow: 12 }
            },
            updatedAt: now - 5000
        };
        localStorage.setItem(`${STORAGE_PREFIX}test-user`, JSON.stringify(localState));

        mockLoadEvents.mockImplementation(() => {
            return new Promise<EmptyRemoteEventsPayload>((resolve) => {
                resolveRemoteEvents = resolve;
            });
        });

        mockAuthValue.user = user;
        render(<App />);

        // Should initially show local event
        expect(await screen.findByText('Local Event')).toBeInTheDocument();

        // Then it should be cleared when remote data (which is newer and empty) arrives
        expect(resolveRemoteEvents).not.toBeNull();
        resolveRemoteEvents!({
            events: [],
            updatedAt: now
        });

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
                settings: { theme: 'blue', year: 2026, startMonth: 0, monthsToShow: 12 }
            },
            updatedAt: now
        };
        localStorage.setItem(`${STORAGE_PREFIX}test-user`, JSON.stringify(localState));

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

    it('should apply newer remote settings even when local events changed more recently', async () => {
        const user = { uid: 'test-user' } as User;
        const baseTime = 1000;
        let settingsCallback: any = null;

        mockSubscribeToSettings.mockImplementation((uid: string, callback: any) => {
            settingsCallback = callback;
            return () => { };
        });

        localStorage.setItem(`${STORAGE_PREFIX}test-user`, JSON.stringify({
            data: {
                events: [],
                settings: {
                    theme: 'blue',
                    highlightToday: true,
                    showWeekends: true,
                    showDayProgress: true,
                    weekdayAlign: true,
                    year: 2026,
                    startMonth: 0,
                    monthsToShow: 12
                }
            },
            updatedAt: baseTime,
            pendingSyncSlices: {
                events: false,
                settings: false
            }
        }));

        mockAuthValue.user = user;
        render(<App />);
        await waitForPlanner();

        const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(baseTime + 1000);

        const dayCells = screen.getAllByText('15');
        const dayCell = dayCells[0].closest('.day-cell');
        fireEvent.mouseDown(dayCell!);
        fireEvent.mouseUp(dayCell!);

        const titleInput = await screen.findByPlaceholderText(/Event Name/i);
        fireEvent.change(titleInput, { target: { value: 'Local Event' } });
        fireEvent.click(screen.getByText(/Save/i));

        expect(await screen.findByText('Local Event')).toBeInTheDocument();

        dateNowSpy.mockRestore();

        await act(async () => {
            settingsCallback?.({
                theme: 'dark',
                updatedAt: baseTime + 500
            });
        });

        await waitFor(() => {
            expect(document.body.getAttribute('data-theme')).toBe('dark');
        });
        expect(screen.getByText('Local Event')).toBeInTheDocument();
    });

    it('should sync pending local changes after reopening online', async () => {
        const user = { uid: 'test-user' } as User;
        const now = Date.now();

        localStorage.setItem(`${STORAGE_PREFIX}test-user`, JSON.stringify({
            data: {
                events: [{ id: '1', title: 'Offline Edit', start: '2026-01-15', end: '2026-01-15', color: 0 }],
                settings: {
                    theme: 'blue',
                    highlightToday: true,
                    showWeekends: true,
                    showDayProgress: true,
                    weekdayAlign: true,
                    year: 2026,
                    startMonth: 0,
                    monthsToShow: 12
                }
            },
            updatedAt: now,
            pendingSyncSlices: {
                events: true,
                settings: true
            }
        }));

        mockAuthValue.user = user;
        render(<App />);

        expect(await screen.findByText('Offline Edit')).toBeInTheDocument();

        await waitFor(() => {
            expect(mockSyncEvents).toHaveBeenCalled();
            expect(mockSyncSettings).toHaveBeenCalled();
        });
    });

    it('should debounce Firebase sync on rapid changes and only sync changed documents', async () => {
        const user = { uid: 'test-user' } as User;

        mockAuthValue.user = user;
        render(<App />);

        // Wait for initial render with real timers
        await waitForPlanner();

        vi.useFakeTimers();

        try {
            for (let i = 0; i < 3; i++) {
                const dayCells = screen.getAllByText('15');
                const dayCell = dayCells[0].closest('.day-cell');

                fireEvent.mouseDown(dayCell!);
                fireEvent.mouseUp(dayCell!);

                const titleInput = screen.getByPlaceholderText(/Event Name/i);
                fireEvent.change(titleInput, { target: { value: `Event ${i}` } });

                const saveBtn = screen.getByText(/Save/i);
                fireEvent.click(saveBtn);

                await act(async () => {
                    vi.advanceTimersByTime(50);
                });
            }

            expect(mockSyncSettings).not.toHaveBeenCalled();

            await act(async () => {
                vi.advanceTimersByTime(2000);
            });

            expect(mockSyncEvents).toHaveBeenCalledTimes(1);
            expect(mockSyncSettings).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it('should keep newer event changes dirty while an older sync is still in flight', async () => {
        const user = { uid: 'test-user' } as User;
        let resolveFirstSync: ((value: boolean) => void) | null = null;

        mockSyncEvents
            .mockImplementationOnce(() => new Promise<boolean>((resolve) => {
                resolveFirstSync = resolve;
            }))
            .mockResolvedValue(true);

        mockAuthValue.user = user;
        render(<App />);
        await waitForPlanner();

        vi.useFakeTimers();

        try {
            const createEvent = async (title: string) => {
                const dayCells = screen.getAllByText('15');
                const dayCell = dayCells[0].closest('.day-cell');

                fireEvent.mouseDown(dayCell!);
                fireEvent.mouseUp(dayCell!);

                const titleInput = screen.getByPlaceholderText(/Event Name/i);
                fireEvent.change(titleInput, { target: { value: title } });
                fireEvent.click(screen.getByText(/Save/i));

                await act(async () => {
                    vi.advanceTimersByTime(50);
                });
            };

            await createEvent('Event 1');

            await act(async () => {
                vi.advanceTimersByTime(500);
            });

            expect(mockSyncEvents).toHaveBeenCalledTimes(1);
            expect(resolveFirstSync).not.toBeNull();

            await createEvent('Event 2');

            await act(async () => {
                resolveFirstSync?.(true);
                await Promise.resolve();
            });

            await act(async () => {
                vi.advanceTimersByTime(500);
            });

            expect(mockSyncEvents).toHaveBeenCalledTimes(2);
            expect(mockSyncSettings).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
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
        expect(await screen.findByText(String(new Date().getFullYear()), {}, { timeout: 10000 })).toBeInTheDocument();

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
        localStorage.setItem(`${STORAGE_PREFIX}guest`, 'invalid json {{{');
        render(<App />);
        // The app detects guest usage intent (via item presence) and defaults to empty state if parse fails
        await waitForPlanner();
    });

    it('should handle Firebase load errors and continue with local data', async () => {
        const user = { uid: 'test-user' } as User;
        const state = {
            data: {
                events: [{ id: '1', title: 'Local Only Event', start: '2026-01-15', end: '2026-01-15', color: 0 }],
                settings: { theme: 'blue', year: 2026, startMonth: 0, monthsToShow: 12 }
            },
            updatedAt: Date.now()
        };
        localStorage.setItem(`${STORAGE_PREFIX}test-user`, JSON.stringify(state));

        mockLoadEvents.mockRejectedValue(new Error('Network error'));
        mockAuthValue.user = user;
        render(<App />);

        expect(await screen.findByText('Local Only Event', {}, { timeout: 10000 })).toBeInTheDocument();
    });
});

