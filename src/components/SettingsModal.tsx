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
    clearAll, onClose, user, onSignOut, isGuest
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
                        <button className="btn-danger-outline" style={{ width: '100%' }} onClick={clearAll}>Clear All Events</button>
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
