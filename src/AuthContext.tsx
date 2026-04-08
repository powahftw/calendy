import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import toast from 'react-hot-toast';
import { auth, isFirebaseConfigured } from './firebase';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut as fbSignOut, User } from 'firebase/auth';
import { getUserFacingErrorMessage } from './utils/userFacingErrors';

interface AuthContextType {
    user: User | null;
    loading: boolean;
    isFirebaseAvailable: boolean;
    signInWithGoogle: () => Promise<void>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(isFirebaseConfigured);

    useEffect(() => {
        if (!auth) {
            setLoading(false);
            return;
        }

        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setUser(user);
            setLoading(false);
        });
        return unsubscribe;
    }, []);

    const signInWithGoogle = async () => {
        if (!auth) return;

        try {
            const provider = new GoogleAuthProvider();
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
