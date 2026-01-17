import React, { FC, useEffect, useState } from 'react';
import CalendarImportModal from './CalendarImportModal';
import { themes } from '../utils/calendarUtils';
import { User } from 'firebase/auth';
import { usePlanner } from '../context/PlannerContext';
import { PlannerEvent } from '../utils/calendarUtils';

interface SettingsModalProps {
    onClose: () => void;
    user: User | null;
    onSignOut: () => void;
    isGuest?: boolean;
}

const SettingsModal: FC<SettingsModalProps> = ({
    onClose, user, onSignOut, isGuest
}) => {
    const [showImportModal, setShowImportModal] = useState(false);

    const {
        year, setYear,
        monthsToShow, setMonthsToShow,
        theme, setTheme,
        highlightToday, setHighlightToday,
        showWeekends, setShowWeekends,
        showDayProgress, setShowDayProgress,
        weekdayAlign, setWeekdayAlign,
        setEvents,
        events
    } = usePlanner();

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const clearAll = () => {
        if (window.confirm("Clear all events?")) setEvents([]);
    };

    const handleExport = () => {
        if (events.length === 0) {
            alert("No events to export.");
            return;
        }

        // Group by Month Year
        const groups: { [key: string]: PlannerEvent[] } = {};
        const sortedEvents = [...events].sort((a, b) => {
            const da = new Date(a.start);
            const db = new Date(b.start);
            return da.getTime() - db.getTime();
        });

        sortedEvents.forEach(ev => {
            const [y, m, dstr] = ev.start.split('-').map(Number);
            // Create date using local time constructor to avoid timezone offsets causing month shifts
            const dateObj = new Date(y, m - 1, dstr);
            const key = dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

            if (!groups[key]) groups[key] = [];
            groups[key].push(ev);
        });

        let exportText = "";
        for (const [groupName, groupEvents] of Object.entries(groups)) {
            exportText += `${groupName}:\n`;
            groupEvents.forEach(ev => {
                // Format: [DD-MM - DD-MM] Title
                // Assuming start and end are YYYY-MM-DD
                const startParts = ev.start.split('-');
                const endParts = ev.end.split('-');
                const startStr = `${startParts[2]}-${startParts[1]}`;
                const endStr = `${endParts[2]}-${endParts[1]}`;

                exportText += `[${startStr} - ${endStr}] ${ev.title}\n`;
            });
            exportText += "\n";
        }

        navigator.clipboard.writeText(exportText).then(() => {
            alert("Events exported to clipboard!");
        }).catch(err => {
            console.error('Failed to copy: ', err);
            alert("Failed to copy events.");
        });
    };

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
                            <button className="btn-primary-outline btn-icon-with-text" onClick={handleExport}>
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

                    <div className="settings-section">
                        <h4>Integrations</h4>
                        <button
                            className="import-integration-btn"
                            onClick={() => setShowImportModal(true)}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                                <line x1="16" y1="2" x2="16" y2="6"></line>
                                <line x1="8" y1="2" x2="8" y2="6"></line>
                                <line x1="3" y1="10" x2="21" y2="10"></line>
                            </svg>
                            Import from Google Calendar
                        </button>
                    </div>
                </div>
            </div>
            {showImportModal && <CalendarImportModal onClose={() => setShowImportModal(false)} />}
        </div>
    );
};

export default SettingsModal;
