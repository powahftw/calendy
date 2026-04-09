import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import toast from 'react-hot-toast';
import { auth, isFirebaseConfigured } from './firebase';
import { GoogleAuthProvider, getRedirectResult, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut as fbSignOut, User } from 'firebase/auth';
import { getUserFacingErrorMessage } from './utils/userFacingErrors';

interface AuthContextType {
    user: User | null;
    loading: boolean;
    isFirebaseAvailable: boolean;
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
            stopLoading();
        });

        getRedirectResult(auth)
            .then((result) => {
                if (!isMounted || !result?.user) return;
                setUser(result.user);
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

            if (shouldUseRedirectSignIn(auth.config.authDomain)) {
                await signInWithRedirect(auth, provider);
                return;
            }

            await signInWithPopup(auth, provider);
        } catch (error) {
            console.error("Error signing in with Google", error);
            toast.error(getUserFacingErrorMessage(error, 'Failed to sign in with Google. Please try again.'));
        }
    };

    const signOut = async () => {
        if (!auth) return;

        try {
            await fbSignOut(auth);
        } catch (error) {
            console.error("Error signing out", error);
            toast.error(getUserFacingErrorMessage(error, 'Failed to sign out. Please try again.'));
        }
    };

    return (
        <AuthContext.Provider value={{ user, loading, isFirebaseAvailable: isFirebaseConfigured, signInWithGoogle, signOut }}>
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
