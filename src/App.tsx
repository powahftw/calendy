import React from 'react';
import { Toaster } from 'react-hot-toast';
import './App.css';
import './utils/logger';
import { useAuth } from './AuthContext';
import LoginScreen from './LoginScreen';
import { AppProvider } from './context/AppProvider';
import PlannerView from './components/PlannerView';
import { useGuestMode } from './hooks/useGuestMode';

const AppToaster = () => (
  <Toaster
    position="top-center"
    toastOptions={{
      className: 'custom-toast',
      duration: 3000,
    }}
  />
);

function App() {
  const { user, loading: authLoading, signOut } = useAuth();
  const { isGuest, setIsGuest, enableGuest } = useGuestMode(user, authLoading);

  if (authLoading) {
    return (
      <>
        <AppToaster />
        <div className="loading-container">
          <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
        </div>
      </>
    );
  }

  if (!user && !isGuest) {
    return (
      <>
        <AppToaster />
        <LoginScreen onGuestLogin={enableGuest} />
      </>
    );
  }

  return (
    <AppProvider user={user}>
      <AppToaster />
      <PlannerView
        user={user}
        signOut={signOut}
        isGuest={isGuest}
        setIsGuest={setIsGuest}
      />
    </AppProvider>
  );
}

export default App;
