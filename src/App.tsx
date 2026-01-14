import React, { useState } from 'react';
import './App.css';
import { useAuth } from './AuthContext';
import LoginScreen from './LoginScreen';
import { PlannerProvider } from './context/PlannerContext';
import PlannerView from './components/PlannerView';

function App() {
  const { user, loading: authLoading, signOut } = useAuth();
  const [isGuest, setIsGuest] = useState(false);

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
