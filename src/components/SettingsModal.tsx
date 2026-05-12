import React, { FC, useMemo, useRef, useState } from 'react';
import { themes } from '../utils/calendarUtils';
import { serializeEvents, parseEvents, mergeImportedEvents } from '../utils/calendar/importExportUtils';
import { User } from 'firebase/auth';
import { usePlanner } from '../context/PlannerContext';
import toast from 'react-hot-toast';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { showUndoToast } from '../utils/showUndoToast';
import { isGoogleCalendarSyncConfigured } from '../services/CalendarService';
import type { GoogleCalendarSyncControls } from '../hooks/useGoogleCalendarSync';

interface SettingsModalProps {
    onClose: () => void;
    user: User | null;
    onSignOut: () => void;
    isGuest?: boolean;
}

interface GoogleSyncSectionProps {
    user: User | null;
    googleSync: GoogleCalendarSyncControls;
    onOpenSetup: () => void;
}

const GoogleSyncSection: FC<GoogleSyncSectionProps> = ({ user, googleSync, onOpenSetup }) => (
    <div className="settings-section">
        <h4>Integrations</h4>
        <button
            className="import-integration-btn"
            onClick={onOpenSetup}
            disabled={!user || !isGoogleCalendarSyncConfigured || googleSync.loading}
            title={
                !user
                    ? 'Sign in to enable Google Calendar sync.'
                    : isGoogleCalendarSyncConfigured
                        ? undefined
                        : 'Add VITE_GOOGLE_CALENDAR_CLIENT_ID to enable Calendar sync.'
            }
        >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 7.5V6a2 2 0 0 0-2-2h-1V2"></path>
                <path d="M6 2v2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h6.5"></path>
                <path d="M3 10h18"></path>
                <path d="m16 19 2 2 4-4"></path>
                <path d="M16 13.5a4.5 4.5 0 1 0 4.5 4.5"></path>
            </svg>
            {googleSync.settings?.enabled ? 'Google Calendar Sync Connected' : 'Sync with Google Calendar'}
        </button>
        {googleSync.settings?.enabled && (
            <button
                className="btn-primary-outline btn-icon-with-text"
                onClick={() => void googleSync.syncNow()}
                disabled={googleSync.syncing}
                style={{ marginTop: '0.75rem', width: '100%', justifyContent: 'center' }}
            >
                {googleSync.syncing ? 'Syncing...' : 'Sync Now'}
            </button>
        )}
        {googleSync.error && (
            <div className="error-msg" style={{ color: '#ef4444', marginTop: '0.75rem', fontSize: '0.85rem' }}>
                {googleSync.error}
            </div>
        )}
    </div>
);

interface GoogleSyncSetupModalProps {
    googleSync: GoogleCalendarSyncControls;
    onClose: () => void;
    onConnect: () => void;
}

const GoogleSyncSetupModal: FC<GoogleSyncSetupModalProps> = ({ googleSync, onClose, onConnect }) => (
    <div className="modal-overlay" onMouseDown={(e: React.MouseEvent) => e.target === e.currentTarget && onClose()}>
        <div className="modal bounce-in" style={{ width: '420px', maxWidth: '95vw' }}>
            <div className="modal-header">
                <h3 style={{ fontSize: '1.25rem' }}>Sync with Google Calendar</h3>
                <button onClick={onClose} className="close-btn">&times;</button>
            </div>
            <div className="settings-content" style={{ padding: '24px' }}>
                {googleSync.settings?.enabled ? (
                    <>
                        <p style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.5' }}>
                            Calendy is syncing all-day events with the dedicated Google Calendar.
                        </p>
                        <button className="btn-primary" style={{ width: '100%' }} onClick={() => void googleSync.syncNow()} disabled={googleSync.syncing}>
                            {googleSync.syncing ? 'Syncing...' : 'Sync Now'}
                        </button>
                    </>
                ) : (
                    <>
                        <p style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.5' }}>
                            Calendy will create a new calendar called "Calendy" in your Google account. All-day events will sync both ways.
                        </p>
                        <button className="btn-primary" style={{ width: '100%' }} onClick={onConnect} disabled={googleSync.loading}>
                            {googleSync.loading ? 'Connecting...' : 'Connect'}
                        </button>
                    </>
                )}
            </div>
        </div>
    </div>
);

const SettingsModal: FC<SettingsModalProps> = ({
    onClose, user, onSignOut, isGuest
}) => {
    const [showSyncSetupModal, setShowSyncSetupModal] = useState(false);

    const {
        year, setYear,
        startMonth, setStartMonth,
        monthsToShow, setMonthsToShow,
        theme, setTheme,
        highlightToday, setHighlightToday,
        showWeekends, setShowWeekends,
        showDayProgress, setShowDayProgress,
        weekdayAlign, setWeekdayAlign,
        setEvents,
        events,
        undo,
        googleSync
    } = usePlanner();

    useEscapeKey(onClose);

    const handleClearAll = () => {
        setEvents([]);
        showUndoToast('All events cleared.', undo);
    };

    const handleExport = () => {
        if (events.length === 0) {
            toast.error("No events to export.");
            return;
        }

        const exportText = serializeEvents(events);
        const blob = new Blob([exportText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'calendy_export.txt';
        a.click();
        URL.revokeObjectURL(url);
        toast.success(`Exported ${events.length} events to calendy_export.txt`);
    };

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragOver, setIsDragOver] = useState(false);

    const handleImportFile = (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            if (text) {
                const importedEvents = parseEvents(text);
                if (importedEvents.length > 0) {
                    const { uniqueEvents, duplicateCount, mergedEvents } = mergeImportedEvents(importedEvents, events);

                    if (uniqueEvents.length > 0) {
                        setEvents(mergedEvents);
                        if (duplicateCount > 0) {
                            toast.success(`Imported ${uniqueEvents.length} events. Skipped ${duplicateCount} duplicates.`);
                        } else {
                            toast.success(`Imported ${uniqueEvents.length} events!`);
                        }
                    } else {
                        toast.error(`No new events found. ${duplicateCount} duplicates skipped.`);
                    }
                } else {
                    toast.error("No valid events found in file.");
                }
            }
        };
        reader.onerror = () => {
            toast.error("Failed to read the file.");
        };
        reader.readAsText(file);
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleImportFile(e.dataTransfer.files[0]);
        }
    };

    const onDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(true);
    };

    const onDragLeave = () => {
        setIsDragOver(false);
    };

    const handleConnectSync = async () => {
        const connected = await googleSync.setup();
        if (connected) setShowSyncSetupModal(false);
    };

    const checkboxSettings = useMemo(() => ([
        {
            id: 'alignWs',
            label: 'Align Weekdays',
            checked: weekdayAlign,
            onChange: setWeekdayAlign
        },
        {
            id: 'hlToday',
            label: 'Highlight Current Day',
            checked: highlightToday,
            onChange: setHighlightToday
        },
        {
            id: 'shwWeekends',
            label: 'Highlight Weekends',
            checked: showWeekends,
            onChange: setShowWeekends
        },
        {
            id: 'shwDayProg',
            label: 'Show Day Progress (Day X / 365)',
            checked: showDayProgress,
            onChange: setShowDayProgress
        }
    ]), [
        weekdayAlign,
        highlightToday,
        showWeekends,
        showDayProgress,
        setWeekdayAlign,
        setHighlightToday,
        setShowWeekends,
        setShowDayProgress
    ]);

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
                                        setYear(now.getFullYear());
                                        setStartMonth(now.getMonth());
                                    } else {
                                        setYear(Number(val));
                                        setStartMonth(0);
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
                            <select className="modal-input" value={monthsToShow} onChange={e => setMonthsToShow(Number(e.target.value))}>
                                <option value={3}>Quarter (3 months)</option>
                                <option value={6}>Half (6 months)</option>
                                <option value={12}>Yearly (365 days)</option>
                            </select>
                        </div>
                        {checkboxSettings.map(setting => (
                            <div className="setting-row checkbox" key={setting.id}>
                                <input
                                    className="checkbox-input"
                                    type="checkbox"
                                    id={setting.id}
                                    checked={setting.checked}
                                    onChange={e => setting.onChange(e.target.checked)}
                                />
                                <label htmlFor={setting.id}>{setting.label}</label>
                            </div>
                        ))}
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
                                Export
                            </button>

                            <div
                                className={`import-dropzone ${isDragOver ? 'drag-over' : ''}`}
                                onDrop={onDrop}
                                onDragOver={onDragOver}
                                onDragLeave={onDragLeave}
                            >
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    style={{ display: 'none' }}
                                    accept=".txt"
                                    onChange={(e) => e.target.files?.[0] && handleImportFile(e.target.files[0])}
                                />
                                <button className="btn-primary-outline btn-icon-with-text" onClick={() => fileInputRef.current?.click()}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                        <polyline points="7 10 12 15 17 10"></polyline>
                                        <line x1="12" y1="15" x2="12" y2="3"></line>
                                    </svg>
                                    Import
                                </button>
                            </div>

                            <button
                                className="btn-danger-outline btn-icon-with-text"
                                onClick={handleClearAll}
                                title="Clear All Events"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                                <span>Clear All</span>
                            </button>
                        </div>
                    </div>
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

                    <GoogleSyncSection
                        user={user}
                        googleSync={googleSync}
                        onOpenSetup={() => setShowSyncSetupModal(true)}
                    />
                </div>
            </div>
            {showSyncSetupModal && (
                <GoogleSyncSetupModal
                    googleSync={googleSync}
                    onClose={() => setShowSyncSetupModal(false)}
                    onConnect={() => void handleConnectSync()}
                />
            )}
        </div>
    );
};

export default SettingsModal;
