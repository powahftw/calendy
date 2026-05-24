import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import toast from 'react-hot-toast';
import { auth, isFirebaseConfigured } from './firebase';
import { GoogleAuthProvider, getRedirectResult, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut as fbSignOut, User } from 'firebase/auth';
import { getUserFacingErrorMessage } from './utils/userFacingErrors';
import { GOOGLE_CALENDAR_SCOPE, isGoogleCalendarSyncConfigured } from './services/CalendarService';

interface AuthContextType {
    user: User | null;
    loading: boolean;
    isFirebaseAvailable: boolean;
    googleCalendarAccessToken: string | null;
    signInWithGoogle: () => Promise<void>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const isSameOriginAuthDomain = (authDomain: string | undefined) => {
    if (typeof window === 'undefined' || !authDomain) return false;

    return authDomain === window.location.hostname || authDomain === window.location.host;
};

const shouldUseRedirectSignIn = (authDomain: string | undefined) => {
    if (typeof navigator === 'undefined') return false;

    const userAgent = navigator.userAgent || '';
    const isIphoneOrIpad = /iPad|iPhone|iPod/.test(userAgent);
    const isIpadOs = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    const isMobileBrowser = /Android|webOS|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(userAgent);

    return (isIphoneOrIpad || isIpadOs || isMobileBrowser) && isSameOriginAuthDomain(authDomain);
};

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(isFirebaseConfigured);
    const [googleCalendarAccessToken, setGoogleCalendarAccessToken] = useState<string | null>(null);

    useEffect(() => {
        if (!auth) {
            setLoading(false);
            return;
        }

        let isMounted = true;
        const stopLoading = () => {
            if (isMounted) setLoading(false);
        };

        const loadingTimeout = window.setTimeout(stopLoading, 8000);

        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (!isMounted) return;
            setUser(user);
            if (!user) setGoogleCalendarAccessToken(null);
            stopLoading();
        });

        getRedirectResult(auth)
            .then((result) => {
                if (!isMounted || !result?.user) return;
                setUser(result.user);
                const credential = GoogleAuthProvider.credentialFromResult(result);
                setGoogleCalendarAccessToken(credential?.accessToken ?? null);
            })
            .catch((error) => {
                console.error("Error completing Google redirect sign-in", error);
                toast.error(getUserFacingErrorMessage(error, 'Failed to finish Google sign-in. Please try again.'));
            })
            .finally(stopLoading);

        return () => {
            isMounted = false;
            window.clearTimeout(loadingTimeout);
            unsubscribe();
        };
    }, []);

    const signInWithGoogle = async () => {
        if (!auth) return;

        try {
            const provider = new GoogleAuthProvider();
            provider.setCustomParameters({ prompt: 'select_account' });
            if (isGoogleCalendarSyncConfigured) {
                provider.addScope(GOOGLE_CALENDAR_SCOPE);
            }

            if (shouldUseRedirectSignIn(auth.config.authDomain)) {
                await signInWithRedirect(auth, provider);
                return;
            }

            const result = await signInWithPopup(auth, provider);
            const credential = GoogleAuthProvider.credentialFromResult(result);
            setGoogleCalendarAccessToken(credential?.accessToken ?? null);
        } catch (error) {
            console.error("Error signing in with Google", error);
            toast.error(getUserFacingErrorMessage(error, 'Failed to sign in with Google. Please try again.'));
        }
    };

    const signOut = async () => {
        if (!auth) return;

        try {
            await fbSignOut(auth);
            setGoogleCalendarAccessToken(null);
        } catch (error) {
            console.error("Error signing out", error);
            toast.error(getUserFacingErrorMessage(error, 'Failed to sign out. Please try again.'));
        }
    };

    return (
        <AuthContext.Provider value={{ user, loading, isFirebaseAvailable: isFirebaseConfigured, googleCalendarAccessToken, signInWithGoogle, signOut }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
