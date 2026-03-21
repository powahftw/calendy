import React, { FC, useState } from 'react';
import toast from 'react-hot-toast';
import { usePlanner } from '../context/PlannerContext';
import { useGoogleCalendar } from '../hooks/useGoogleCalendar';
import { CalendarService } from '../services/CalendarService';
import { mergeImportedEvents } from '../utils/calendar/importExportUtils';
import { PlannerEvent, TRANSPARENT_COLOR_INDEX, toDateStr, uid } from '../utils/calendarUtils';

interface CalendarImportModalProps {
    onClose: () => void;
}

type Step = 'AUTH' | 'SELECT_CALENDAR' | 'SELECT_EVENTS' | 'IMPORTING';

const CalendarImportModal: FC<CalendarImportModalProps> = ({ onClose }) => {
    const { events: plannerEvents, setEvents } = usePlanner();
    const [step, setStep] = useState<Step>('AUTH');
    const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
    const { calendars, eligibleEvents, loading, error, connect, fetchEvents } = useGoogleCalendar();

    const handleAuth = async () => {
        const cals = await connect();
        if (cals) {
            setStep('SELECT_CALENDAR');
        }
    };

    const handleCalendarSelect = async (calId: string) => {
        const filtered = await fetchEvents(calId);
        if (filtered) {
            setSelectedEventIds(new Set(filtered.map((event) => event.id)));
            setStep('SELECT_EVENTS');
        }
    };

    const toggleEvent = (id: string) => {
        setSelectedEventIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const toggleAll = () => {
        setSelectedEventIds((prev) => {
            if (prev.size === eligibleEvents.length) {
                return new Set();
            }

            return new Set(eligibleEvents.map((event) => event.id));
        });
    };

    const handleImport = () => {
        setStep('IMPORTING');

        try {
            const newEvents: PlannerEvent[] = [];

            eligibleEvents.forEach((event) => {
                if (!selectedEventIds.has(event.id)) return;

                const start = event.start.dateTime ? new Date(event.start.dateTime) : new Date(event.start.date!);
                const end = event.end.dateTime ? new Date(event.end.dateTime) : new Date(event.end.date!);

                let effectiveEnd = end;
                if (!event.end.dateTime && event.end.date) {
                    // Google Calendar all-day events are returned with an exclusive end date.
                    effectiveEnd = new Date(end.getTime() - 1000);
                }

                const startStr = toDateStr(start.getFullYear(), start.getMonth(), start.getDate());
                const endStr = toDateStr(effectiveEnd.getFullYear(), effectiveEnd.getMonth(), effectiveEnd.getDate());
                const color = Math.floor(Math.random() * TRANSPARENT_COLOR_INDEX);

                newEvents.push({
                    id: uid(),
                    title: event.summary || '(No Title)',
                    start: startStr,
                    end: endStr,
                    color
                });
            });

            const { uniqueEvents, duplicateCount, mergedEvents } = mergeImportedEvents(newEvents, plannerEvents);

            if (uniqueEvents.length > 0) {
                setEvents(mergedEvents);
            }

            if (uniqueEvents.length > 0 && duplicateCount > 0) {
                toast.success(`Imported ${uniqueEvents.length} events. Skipped ${duplicateCount} duplicates.`);
            } else if (uniqueEvents.length > 0) {
                toast.success(`Imported ${uniqueEvents.length} events successfully!`);
            } else {
                toast.error(`No new events found. ${duplicateCount} duplicates skipped.`);
            }

            onClose();
        } catch (err) {
            console.error(err);
            toast.error('Failed to import events.');
            setStep('SELECT_EVENTS');
        }
    };

    const renderContent = () => {
        if (step === 'AUTH') {
            return (
                <div style={{ textAlign: 'center', padding: '1rem' }}>
                    <p style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.5' }}>
                        Pick a Google account to temporarily read calendar events for this import. This does not change your Calendy sign-in.
                    </p>
                    {error && <div className="error-msg" style={{ color: '#ef4444', marginBottom: '1.5rem', fontSize: '0.9rem' }}>{error}</div>}
                    <button className="login-google-btn" style={{ margin: '0 0 1.5rem 0', width: '100%' }} onClick={handleAuth} disabled={loading}>
                        <svg width="20" height="20" viewBox="0 0 24 24" style={{ marginRight: '8px' }}>
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                        </svg>
                        {loading ? 'Opening Google...' : 'Choose Google Account'}
                    </button>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', opacity: 0.6 }}>
                        Access is limited to read-only calendar events for this import session.
                    </div>
                </div>
            );
        }

        if (step === 'SELECT_CALENDAR') {
            return (
                <div className="cal-list">
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>Select which calendar to fetch events from:</p>
                    {error && <div className="error-msg" style={{ color: '#ef4444', marginBottom: '1rem' }}>{error}</div>}
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                            <div className="loading-spinner" style={{ marginBottom: '1rem' }}></div>
                            Fetching calendars...
                        </div>
                    ) : (
                        <div className="list-group">
                            {calendars.map((calendar) => (
                                <button
                                    key={calendar.id}
                                    className="list-item-btn"
                                    onClick={() => handleCalendarSelect(calendar.id)}
                                >
                                    <div className="list-item-dot" style={{ backgroundColor: calendar.backgroundColor || 'var(--accent-color)' }}></div>
                                    <span className="list-item-label">{calendar.summary}</span>
                                    {calendar.primary && <span className="list-item-meta">Primary</span>}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            );
        }

        if (step === 'SELECT_EVENTS') {
            return (
                <div className="event-list-step">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                            {eligibleEvents.length} long duration events found.
                        </span>
                        <button className="btn-text" onClick={toggleAll} style={{ padding: '4px 8px', fontWeight: 600, color: 'var(--accent-color)' }}>
                            {selectedEventIds.size === eligibleEvents.length ? 'Deselect All' : 'Select All'}
                        </button>
                    </div>

                    <div className="event-selection-list">
                        {eligibleEvents.map((event) => {
                            const isSelected = selectedEventIds.has(event.id);
                            const start = event.start.dateTime ? new Date(event.start.dateTime) : new Date(event.start.date!);
                            const dateLabel = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                            const durationDays = Math.max(1, Math.round(CalendarService.getDurationInHours(event) / 24));

                            return (
                                <div
                                    key={event.id}
                                    className={`event-selection-item ${isSelected ? 'selected' : ''}`}
                                    onClick={() => toggleEvent(event.id)}
                                >
                                    <input
                                        type="checkbox"
                                        className="event-selection-checkbox"
                                        checked={isSelected}
                                        onChange={() => { }}
                                    />
                                    <div className="event-selection-info">
                                        <div className="event-selection-title">{event.summary || '(No Title)'}</div>
                                        <div className="event-selection-details">{dateLabel} - ~{durationDays} days</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <button className="btn-text" onClick={() => setStep('SELECT_CALENDAR')}>Back</button>
                        <button className="btn-primary" onClick={handleImport} disabled={selectedEventIds.size === 0}>
                            Import {selectedEventIds.size} Events
                        </button>
                    </div>
                </div>
            );
        }

        if (step === 'IMPORTING') {
            return (
                <div style={{ textAlign: 'center', padding: '3rem' }}>
                    <div className="loading-spinner"></div>
                    <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>Importing events...</p>
                </div>
            );
        }

        return null;
    };

    return (
        <div className="modal-overlay" onMouseDown={(e: React.MouseEvent) => e.target === e.currentTarget && onClose()}>
            <div className="modal bounce-in" style={{ width: '450px', maxWidth: '95vw' }}>
                <div className="modal-header">
                    <h3 style={{ fontSize: '1.25rem' }}>Import from Calendar</h3>
                    <button onClick={onClose} className="close-btn">&times;</button>
                </div>
                <div className="settings-content" style={{ padding: '24px' }}>
                    {renderContent()}
                </div>
            </div>
        </div>
    );
};

export default CalendarImportModal;
