import { useEffect, useState } from 'react';
import { User } from 'firebase/auth';

const GUEST_MODE_KEY = 'planner_guest_mode';
const GUEST_EVENTS_KEY = 'planner_events_guest';

const getInitialGuestMode = () => {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(GUEST_MODE_KEY) === 'true';
};

const resolveStoredGuestMode = () => {
  const storedGuestMode = localStorage.getItem(GUEST_MODE_KEY);
  const hasGuestEvents = !!localStorage.getItem(GUEST_EVENTS_KEY);
  return storedGuestMode === 'true' || (storedGuestMode === null && hasGuestEvents);
};

export const useGuestMode = (user: User | null, authLoading: boolean) => {
  const [isGuest, setIsGuest] = useState(getInitialGuestMode);

  useEffect(() => {
    if (authLoading) return;
    if (user) {
      setIsGuest(false);
      return;
    }

    setIsGuest(resolveStoredGuestMode());
  }, [authLoading, user]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(GUEST_MODE_KEY, isGuest ? 'true' : 'false');
  }, [isGuest]);

  const enableGuest = () => setIsGuest(true);

  return { isGuest, setIsGuest, enableGuest };
};
