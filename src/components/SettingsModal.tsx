import React, { FC, useState } from 'react';
import { User } from 'firebase/auth';
import toast from 'react-hot-toast';
import { themes } from '../utils/calendarUtils';
import { usePlanner } from '../context/PlannerContext';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { exportEventsToMarkdown, getExportFilename } from '../utils/calendar/exportEvents';
import CalendarPicker from './CalendarPicker';

interface SettingsModalProps {
    onClose: () => void;
    user: User;
    onSignOut: () => void;
}

const SettingsHelperText: FC<{ children: React.ReactNode }> = ({ children }) => (
    <p className="settings-helper-text">{children}</p>
);

const formatLastFetched = (lastFetchedAt: number | null): string => {
    if (!lastFetchedAt) return 'not yet loaded';

    const minutes = Math.floor((Date.now() - lastFetchedAt) / 60_000);
    if (minutes < 1) return 'just now';
    if (minutes === 1) return '1 minute ago';
    if (minutes < 60) return `${minutes} minutes ago`;

    const hours = Math.floor(minutes / 60);
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
};

const SettingsModal: FC<SettingsModalProps> = ({ onClose, user, onSignOut }) => {
    const [showCalendarPicker, setShowCalendarPicker] = useState(false);

    const planner = usePlanner();
    const { year, startMonth, monthsToShow, theme, setTheme, updateSettings } = planner;
    const { events, connection, refresh, refreshing, lastFetchedAt } = planner;

    useEscapeKey(onClose);

    const handleExport = () => {
        const view = {
            year,
            startMonth,
            monthsToShow,
            calendarName: connection.selection?.calendarSummary
        };
        const markdown = exportEventsToMarkdown(events, view);
        const filename = getExportFilename(view);

        const blob = new Blob([markdown], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(`Exported to ${filename}`);
    };

    const toggles = [
        { key: 'weekdayAlign', label: 'Align Weekdays' },
        { key: 'highlightToday', label: 'Highlight Current Day' },
        { key: 'showWeekends', label: 'Highlight Weekends' },
        { key: 'showDayProgress', label: 'Show Day Progress (Day X / 365)' },
        { key: 'pillUnmarkedEvents', label: 'Show a pill on days with only unmarked events' }
    ] as const;

    return (
        <div
            className="modal-overlay"
            onMouseDown={(e: React.MouseEvent) => e.target === e.currentTarget && onClose()}
            onTouchStart={(e: React.TouchEvent) => e.target === e.currentTarget && onClose()}
        >
            <div className="modal bounce-in settings-modal">
                <div className="modal-header">
                    <h3>Settings</h3>
                    <button onClick={onClose} className="close-btn">&times;</button>
                </div>
                <div className='settings-content'>
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
                            <select
                                className="modal-input"
                                value={startMonth !== 0 ? "today" : String(year)}
                                onChange={e => {
                                    const val = e.target.value;
                                    if (val === "today") {
                                        const now = new Date();
                                        updateSettings({ year: now.getFullYear(), startMonth: now.getMonth() });
                                    } else {
                                        updateSettings({ year: Number(val), startMonth: 0 });
                                    }
                                }}
                            >
                                <option value="today">Today</option>
                                <option value={year - 2}>{year - 2}</option>
                                <option value={year - 1}>{year - 1}</option>
                                <option value={year}>{year}</option>
                                <option value={year + 1}>{year + 1}</option>
                                <option value={year + 2}>{year + 2}</option>
                                <option value={year + 3}>{year + 3}</option>
                            </select>
                        </div>
                        <div className="setting-row">
                            <label>Range</label>
                            <select className="modal-input" value={monthsToShow} onChange={e => updateSettings({ monthsToShow: Number(e.target.value) })}>
                                <option value={3}>Quarter (3 months)</option>
                                <option value={6}>Half (6 months)</option>
                                <option value={12}>Yearly (365 days)</option>
                            </select>
                        </div>
                        {toggles.map(({ key, label }) => (
                            <div className="setting-row checkbox" key={key}>
                                <input
                                    className="checkbox-input"
                                    type="checkbox"
                                    id={key}
                                    checked={planner[key]}
                                    onChange={e => updateSettings({ [key]: e.target.checked })}
                                />
                                <label htmlFor={key}>{label}</label>
                            </div>
                        ))}
                    </div>

                    <div className="settings-section">
                        <h4>Google Calendar</h4>
                        {connection.selection ? (
                            <SettingsHelperText>
                                Viewing <strong>{connection.selection.calendarSummary || connection.selection.calendarId}</strong>
                                {' '}(read-only) &middot; updated {formatLastFetched(lastFetchedAt)}
                            </SettingsHelperText>
                        ) : (
                            <SettingsHelperText>No calendar selected yet.</SettingsHelperText>
                        )}

                        <div className="settings-actions-row">
                            <button
                                className="btn-primary-outline btn-icon-with-text"
                                onClick={() => setShowCalendarPicker(open => !open)}
                                aria-expanded={showCalendarPicker}
                            >
                                {showCalendarPicker ? 'Hide calendars' : 'Change calendar'}
                            </button>
                            <button
                                className="btn-primary-outline btn-icon-with-text"
                                onClick={() => void refresh()}
                                disabled={refreshing || !connection.selection}
                            >
                                {refreshing ? 'Refreshing…' : 'Refresh now'}
                            </button>
                        </div>

                        {showCalendarPicker && (
                            <CalendarPicker
                                connection={connection}
                                variant="inline"
                                onPicked={() => setShowCalendarPicker(false)}
                            />
                        )}
                    </div>

                    <div className="settings-section">
                        <h4>Data</h4>
                        <div className="settings-actions-row">
                            <button className="btn-primary-outline btn-icon-with-text" onClick={handleExport}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                    <polyline points="17 8 12 3 7 8"></polyline>
                                    <line x1="12" y1="3" x2="12" y2="15"></line>
                                </svg>
                                Export Markdown
                            </button>
                        </div>
                        <SettingsHelperText>
                            Exports every event in the range you are viewing, full-day and timed alike.
                        </SettingsHelperText>
                    </div>

                    <div className="settings-section">
                        <h4>Account</h4>
                        <div className="account-info">
                            <div className="account-user">
                                {user.photoURL ? (
                                    <img src={user.photoURL} alt="" className="account-avatar" />
                                ) : (
                                    <div className="account-avatar account-avatar-placeholder">U</div>
                                )}
                                <div className="account-details">
                                    <span className="account-name">{user.displayName || 'User'}</span>
                                    <span className="account-email">{user.email}</span>
                                </div>
                            </div>
                            <button className="btn-text" onClick={onSignOut}>Sign Out</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
