import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { AuthProvider } from '../AuthContext';

vi.mock('../firebase', () => ({
  auth: {},
  provider: {},
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  db: {},
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth: unknown, callback: (user: null) => void) => {
    callback(null);
    return () => {};
  },
  User: class {},
}));

vi.mock('../components/PlannerView', () => ({
  default: () => <div data-testid="planner-view" />,
}));

vi.mock('../LoginScreen', () => ({
  default: () => <div data-testid="login-screen" />,
}));

describe('App guest persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('restores guest session when events exist', async () => {
    const payload = {
      items: [
        {
          id: 'event-1',
          title: 'Stored Event',
          start: '2026-01-14',
          end: '2026-01-14',
          color: 0,
        },
      ],
      updatedAt: Date.now(),
    };
    localStorage.setItem('planner_events_guest', JSON.stringify(payload));

    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('planner-view')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('login-screen')).toBeNull();
  });

  it('does not crash on invalid local storage payloads', async () => {
    localStorage.setItem('planner_events_guest', '{');

    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('planner-view')).toBeInTheDocument();
    });
  });
});
