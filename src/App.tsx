import { Toaster } from 'react-hot-toast';
import './App.css';
import './utils/logger';
import { useAuth } from './AuthContext';
import LoginScreen from './LoginScreen';
import { AppProvider } from './context/AppProvider';
import PlannerView from './components/PlannerView';

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

  // Sign-in is required: everything Calendy shows comes from the user's
  // Google Calendar.
  if (!user) {
    return (
      <>
        <AppToaster />
        <LoginScreen />
      </>
    );
  }

  return (
    <AppProvider user={user}>
      <AppToaster />
      <PlannerView user={user} signOut={signOut} />
    </AppProvider>
  );
}

export default App;
