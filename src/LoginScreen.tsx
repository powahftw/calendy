import React, { FC } from 'react';
import { useAuth } from './AuthContext';

const LoginScreen: FC<{ onGuestLogin: () => void }> = ({ onGuestLogin }) => {
    const { signInWithGoogle } = useAuth();

    return (
        <div className="login-screen">
            <div className="login-card">
                <div className="login-header">
                    <div className="login-logo">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                            <line x1="16" y1="2" x2="16" y2="6"></line>
                            <line x1="8" y1="2" x2="8" y2="6"></line>
                            <line x1="3" y1="10" x2="21" y2="10"></line>
                        </svg>
                    </div>
                    <h1>Calendy</h1>
                    <p>Your simple, beautiful yearly planner</p>
                </div>

                <div className="login-features">
                    <div className="feature-item">
                        <span className="feature-icon">✨</span>
                        <span>Multi-device sync</span>
                    </div>
                    <div className="feature-item">
                        <span className="feature-icon">🎨</span>
                        <span>Beautiful themes</span>
                    </div>
                    <div className="feature-item">
                        <span className="feature-icon">📅</span>
                        <span>Year-at-a-glance</span>
                    </div>
                </div>

                <button className="login-google-btn" onClick={signInWithGoogle}>
                    <svg width="18" height="18" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                    </svg>
                    Continue with Google
                </button>

                <div className="or-divider">
                    <span>OR</span>
                </div>

                <button className="login-guest-btn" onClick={onGuestLogin}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                    Continue as Guest
                </button>

                <div className="login-footer">
                    <p>Plan your year, one day at a time.</p>
                </div>
            </div>
        </div>
    );
};

export default LoginScreen;
