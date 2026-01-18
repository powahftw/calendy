import React, { FC, useEffect, useState, useRef } from 'react';
import CalendarImportModal from './CalendarImportModal';
import { formatDateRange, PlannerEvent, themes, toLocalDate } from '../utils/calendarUtils';
import { serializeEvents, parseEvents, isDuplicate } from '../utils/calendar/importExportUtils';
import { User } from 'firebase/auth';
import { usePlanner } from '../context/PlannerContext';
import toast from 'react-hot-toast';

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
    const [holdProgress, setHoldProgress] = useState(0);
    const holdTimerRef = useRef<number | null>(null);
    const holdIntervalRef = useRef<number | null>(null);

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
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
            if (holdIntervalRef.current) window.clearInterval(holdIntervalRef.current);
        };
    }, [onClose]);

    const startHold = () => {
        setHoldProgress(0);
        const startTime = Date.now();
        const duration = 3000;

        holdIntervalRef.current = window.setInterval(() => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min((elapsed / duration) * 100, 100);
            setHoldProgress(progress);
        }, 30);

        holdTimerRef.current = window.setTimeout(() => {
            setEvents([]);
            toast.success("All events cleared.");
            cancelHold();
        }, duration);
    };

    const cancelHold = () => {
        if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
        if (holdIntervalRef.current) window.clearInterval(holdIntervalRef.current);
        setHoldProgress(0);
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
                    const uniques = importedEvents.filter(ev => !isDuplicate(ev, events));
                    const duplicates = importedEvents.length - uniques.length;

                    if (uniques.length > 0) {
                        setEvents(prev => [...prev, ...uniques]);
                        if (duplicates > 0) {
                            toast.success(`Imported ${uniques.length} events. Skipped ${duplicates} duplicates.`);
                        } else {
                            toast.success(`Imported ${uniques.length} events!`);
                        }
                    } else {
                        toast.error(`No new events found. ${duplicates} duplicates skipped.`);
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

    const checkboxSettings = [
        {
            id: 'alignWs',
            label: 'Align Weekdays',
            checked: weekdayAlign,
            onChange: (checked: boolean) => setWeekdayAlign(checked)
        },
        {
            id: 'hlToday',
            label: 'Highlight Current Day',
            checked: highlightToday,
            onChange: (checked: boolean) => setHighlightToday(checked)
        },
        {
            id: 'shwWeekends',
            label: 'Highlight Weekends',
            checked: showWeekends,
            onChange: (checked: boolean) => setShowWeekends(checked)
        },
        {
            id: 'shwDayProg',
            label: 'Show Day Progress (Day X / 365)',
            checked: showDayProgress,
            onChange: (checked: boolean) => setShowDayProgress(checked)
        }
    ];

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
                                className="btn-danger-outline btn-icon-with-text btn-hold"
                                onMouseDown={startHold}
                                onMouseUp={cancelHold}
                                onMouseLeave={cancelHold}
                                onTouchStart={startHold}
                                onTouchEnd={cancelHold}
                                style={{ position: 'relative', overflow: 'hidden' }}
                            >
                                <div
                                    className="hold-progress-bar"
                                    style={{ width: `${holdProgress}%` }}
                                />
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ position: 'relative', zIndex: 1 }}>
                                    <path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                                <span style={{ position: 'relative', zIndex: 1 }}>Clear All (Hold 3s)</span>
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
