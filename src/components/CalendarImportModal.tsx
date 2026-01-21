import React, { FC, useState } from 'react';
import { CalendarService } from '../services/CalendarService';
import { usePlanner } from '../context/PlannerContext';
import { PlannerEvent, toDateStr, uid } from '../utils/calendarUtils';
import toast from 'react-hot-toast';
import { useGoogleCalendar } from '../hooks/useGoogleCalendar';

interface CalendarImportModalProps {
    onClose: () => void;
}

type Step = 'AUTH' | 'SELECT_CALENDAR' | 'SELECT_EVENTS' | 'IMPORTING';

const CalendarImportModal: FC<CalendarImportModalProps> = ({ onClose }) => {
    const { events: plannerEvents, setEvents } = usePlanner();
    const [step, setStep] = useState<Step>('AUTH');
    const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
    const { calendars, eligibleEvents, loading, error, signIn, fetchEvents } = useGoogleCalendar();

    const handleAuth = async () => {
        const cals = await signIn();
        if (cals) {
            setStep('SELECT_CALENDAR');
        }
    };

    const handleCalendarSelect = async (calId: string) => {
        const filtered = await fetchEvents(calId);
        if (filtered) {
            setSelectedEventIds(new Set(filtered.map(e => e.id)));
            setStep('SELECT_EVENTS');
        }
    };

    const toggleEvent = (id: string) => {
        setSelectedEventIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            return newSet;
        });
    };

    const toggleAll = () => {
        setSelectedEventIds(prev => {
            if (prev.size === eligibleEvents.length) {
                return new Set();
            } else {
                return new Set(eligibleEvents.map(e => e.id));
            }
        });
    };

    const handleImport = () => {
        setStep('IMPORTING');
        try {
            const newEvents: PlannerEvent[] = [];

            eligibleEvents.forEach(ev => {
                if (!selectedEventIds.has(ev.id)) return;

                const startD = ev.start.dateTime ? new Date(ev.start.dateTime) : new Date(ev.start.date!);
                const endD = ev.end.dateTime ? new Date(ev.end.dateTime) : new Date(ev.end.date!);

                let effectiveEnd = endD;
                if (!ev.end.dateTime && ev.end.date) {
                    // Full day event ends on the next day exclusive in GCal
                    effectiveEnd = new Date(endD.getTime() - 1000);
                }

                const startStr = toDateStr(startD.getFullYear(), startD.getMonth(), startD.getDate());
                const endStr = toDateStr(effectiveEnd.getFullYear(), effectiveEnd.getMonth(), effectiveEnd.getDate());

                // Pick a random color index from the 7 available in the palette
                const colorIdx = Math.floor(Math.random() * 7);

                newEvents.push({
                    id: uid(),
                    title: ev.summary || '(No Title)',
                    start: startStr,
                    end: endStr,
                    color: colorIdx
                });
            });

            setEvents([...plannerEvents, ...newEvents]);
            toast.success(`Imported ${newEvents.length} events successfully!`);
            onClose();
        } catch (err) {
            console.error(err);
            toast.error("Failed to import events.");
            setStep('SELECT_EVENTS');
        }
    };

    const renderContent = () => {
        if (step === 'AUTH') {
            return (
                <div style={{ textAlign: 'center', padding: '1rem' }}>
                    <p style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.5' }}>
                        Connect your Google Calendar to import holidays, vacations, or long events Directly into your planner.
                    </p>
                    {error && <div className="error-msg" style={{ color: '#ef4444', marginBottom: '1.5rem', fontSize: '0.9rem' }}>{error}</div>}
                    <button className="login-google-btn" style={{ margin: '0 0 1.5rem 0', width: '100%' }} onClick={handleAuth} disabled={loading}>
                        <svg width="20" height="20" viewBox="0 0 24 24" style={{ marginRight: '8px' }}>
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                        </svg>
                        {loading ? 'Connecting...' : 'Connect Google Calendar'}
                    </button>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', opacity: 0.6 }}>
                        Only your calendar events are accessed.
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
                            {calendars.map(cal => (
                                <button
                                    key={cal.id}
                                    className="list-item-btn"
                                    onClick={() => handleCalendarSelect(cal.id)}
                                >
                                    <div className="list-item-dot" style={{ backgroundColor: cal.backgroundColor || 'var(--accent-color)' }}></div>
                                    <span className="list-item-label">{cal.summary}</span>
                                    {cal.primary && <span className="list-item-meta">Primary</span>}
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
                        {eligibleEvents.map(ev => {
                            const isSelected = selectedEventIds.has(ev.id);
                            const start = ev.start.dateTime ? new Date(ev.start.dateTime) : new Date(ev.start.date!);
                            const dateStr = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                            const durDays = Math.max(1, Math.round(CalendarService.getDurationInHours(ev) / 24));

                            return (
                                <div
                                    key={ev.id}
                                    className={`event-selection-item ${isSelected ? 'selected' : ''}`}
                                    onClick={() => toggleEvent(ev.id)}
                                >
                                    <input
                                        type="checkbox"
                                        className="event-selection-checkbox"
                                        checked={isSelected}
                                        onChange={() => { }} // Handled by parent div
                                    />
                                    <div className="event-selection-info">
                                        <div className="event-selection-title">{ev.summary || '(No Title)'}</div>
                                        <div className="event-selection-details">{dateStr} • ~{durDays} days</div>
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
                <div className='settings-content' style={{ padding: '24px' }}>
                    {renderContent()}
                </div>
            </div>
        </div>
    );
};

export default CalendarImportModal;
