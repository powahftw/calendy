import React, { useState } from 'react';
import { Toaster } from 'react-hot-toast';
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
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            border: '1px solid var(--line-color)',
          },
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
