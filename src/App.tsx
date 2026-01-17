import React, { useEffect, useState } from 'react';
import './App.css';
import { useAuth } from './AuthContext';
import LoginScreen from './LoginScreen';
import { PlannerProvider } from './context/PlannerContext';
import PlannerView from './components/PlannerView';

const GUEST_MODE_KEY = 'planner_guest_mode';
const GUEST_EVENTS_KEY = 'planner_events_guest';

function App() {
  const { user, loading: authLoading, signOut } = useAuth();
  const [isGuest, setIsGuest] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(GUEST_MODE_KEY) === 'true';
  });

  useEffect(() => {
    if (authLoading) return;
    if (user) {
      setIsGuest(false);
      return;
    }

    const storedGuestMode = localStorage.getItem(GUEST_MODE_KEY);
    const hasGuestEvents = !!localStorage.getItem(GUEST_EVENTS_KEY);
    if (storedGuestMode === 'true' || (storedGuestMode === null && hasGuestEvents)) {
      setIsGuest(true);
    }
  }, [authLoading, user]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(GUEST_MODE_KEY, isGuest ? 'true' : 'false');
  }, [isGuest]);

  if (authLoading) {
    return (
      <div className="loading-container">
        <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
      </div>
    );
  }

  if (!user && !isGuest) {
    return <LoginScreen onGuestLogin={() => setIsGuest(true)} />;
  }

  return (
    <PlannerProvider user={user}>
      <PlannerView
        user={user}
        signOut={signOut}
        isGuest={isGuest}
        setIsGuest={setIsGuest}
      />
    </PlannerProvider>
  );
}

export default App;
