import React from 'react';
import { Toaster } from 'react-hot-toast';
import './App.css';
import './utils/logger';
import { useAuth } from './AuthContext';
import LoginScreen from './LoginScreen';
import { PlannerProvider } from './context/PlannerContext';
import PlannerView from './components/PlannerView';
import { useGuestMode } from './hooks/useGuestMode';

function App() {
  const { user, loading: authLoading, signOut } = useAuth();
  const { isGuest, setIsGuest, enableGuest } = useGuestMode(user, authLoading);

  if (authLoading) {
    return (
      <div className="loading-container">
        <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
      </div>
    );
  }

  if (!user && !isGuest) {
    return <LoginScreen onGuestLogin={enableGuest} />;
  }

  return (
    <PlannerProvider user={user}>
      <Toaster
        position="top-center"
        toastOptions={{
          className: 'custom-toast',
          duration: 3000,
        }}
      />
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
