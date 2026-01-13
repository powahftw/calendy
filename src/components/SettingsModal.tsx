import React, { FC, useEffect } from 'react';
import { themes } from '../utils/calendarUtils';
import { User } from 'firebase/auth';

interface SettingsModalProps {
    year: number;
    setYear: (y: number) => void;
    monthsToShow: number;
    setMonthsToShow: (m: number) => void;
    theme: string;
    setTheme: (t: string) => void;
    weekdayAlign: boolean;
    setWeekdayAlign: (a: boolean) => void;
    highlightToday: boolean;
    setHighlightToday: (h: boolean) => void;
    showWeekends: boolean;
    setShowWeekends: (s: boolean) => void;
    showDayProgress: boolean;
    setShowDayProgress: (s: boolean) => void;
    clearAll: () => void;
    onClose: () => void;
    onExport: () => void;
    user: User | null;
    onSignOut: () => void;
    isGuest?: boolean;
}

const SettingsModal: FC<SettingsModalProps> = ({
    year, setYear,
    monthsToShow, setMonthsToShow,
    theme, setTheme,
    weekdayAlign, setWeekdayAlign,
    highlightToday, setHighlightToday,
    showWeekends, setShowWeekends,
    showDayProgress, setShowDayProgress,
    clearAll, onClose, onExport, user, onSignOut, isGuest
}) => {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    return (
        <div className="modal-overlay" onMouseDown={(e: React.MouseEvent) => e.target === e.currentTarget && onClose()}>
            <div className="modal bounce-in settings-modal">
                <div className="modal-header">
                    <h3>Settings</h3>
                    <button onClick={onClose} className="close-btn">&times;</button>
                </div>
                <div className='settings-content'>

                    {/* Theme Grid */}
                    <div className="settings-section">
                        <h4>Appearance</h4>
                        <div className="theme-grid">
                            {themes.map(t => (
                                <div
                                    key={t.id}
                                    className={`theme-card ${theme === t.id ? 'active' : ''}`}
                                    onClick={() => setTheme(t.id)}
                                >
                                    <div className="theme-color-preview" style={{ backgroundColor: t.primary }}></div>
                                    <span>{t.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="settings-section">
                        <h4>Calendar</h4>
                        <div className="setting-row">
                            <label>Year</label>
                            <input className="modal-input" type="number" value={year} onChange={e => setYear(Number(e.target.value))} />
                        </div>
                        <div className="setting-row">
                            <label>View</label>
                            <select className="modal-input" value={monthsToShow} onChange={e => setMonthsToShow(Number(e.target.value))}>
                                <option value={3}>Q1 (3 Months)</option>
                                <option value={6}>H1 (6 Months)</option>
                                <option value={12}>Full Year</option>
                            </select>
                        </div>
                        <div className="setting-row checkbox">
                            <input className="checkbox-input" type="checkbox" id="alignWs" checked={weekdayAlign} onChange={e => setWeekdayAlign(e.target.checked)} />
                            <label htmlFor="alignWs">Align Weekdays</label>
                        </div>
                        <div className="setting-row checkbox">
                            <input className="checkbox-input" type="checkbox" id="hlToday" checked={highlightToday} onChange={e => setHighlightToday(e.target.checked)} />
                            <label htmlFor="hlToday">Highlight Current Day</label>
                        </div>
                        <div className="setting-row checkbox">
                            <input className="checkbox-input" type="checkbox" id="shwWeekends" checked={showWeekends} onChange={e => setShowWeekends(e.target.checked)} />
                            <label htmlFor="shwWeekends">Highlight Weekends</label>
                        </div>
                        <div className="setting-row checkbox">
                            <input className="checkbox-input" type="checkbox" id="shwDayProg" checked={showDayProgress} onChange={e => setShowDayProgress(e.target.checked)} />
                            <label htmlFor="shwDayProg">Show Day Progress (Day X / 365)</label>
                        </div>
                    </div>

                    <div className="settings-section">
                        <h4>Data</h4>
                        <div className="settings-actions-grid">
                            <button className="btn-primary-outline btn-icon-with-text" onClick={onExport}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                    <polyline points="17 8 12 3 7 8"></polyline>
                                    <line x1="12" y1="3" x2="12" y2="15"></line>
                                </svg>
                                Export as .txt
                            </button>
                            <button className="btn-danger-outline btn-icon-with-text" onClick={clearAll}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                                Clear All Events
                            </button>
                        </div>
                    </div>

                    {/* Account Section */}
                    <div className="settings-section">
                        <h4>Account</h4>
                        <div className="account-info">
                            <div className="account-user">
                                {user?.photoURL ? (
                                    <img src={user.photoURL} alt="" className="account-avatar" />
                                ) : (
                                    <div className="account-avatar account-avatar-placeholder">
                                        {isGuest ? 'G' : 'U'}
                                    </div>
                                )}
                                <div className="account-details">
                                    <span className="account-name">{isGuest ? 'Guest User' : (user?.displayName || 'User')}</span>
                                    <span className="account-email">{isGuest ? 'Local Storage Only' : user?.email}</span>
                                </div>
                            </div>
                            <button className="btn-text" onClick={onSignOut}>
                                {isGuest ? 'Exit Guest Mode' : 'Sign Out'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
