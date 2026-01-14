import React, { FC, useState, useEffect } from 'react';
import { calendarService, CalendarService, GoogleCalendar, GoogleEvent } from '../services/CalendarService';
import { usePlanner } from '../context/PlannerContext';
import { PlannerEvent, toDateStr, uid } from '../utils/calendarUtils';

interface CalendarImportModalProps {
    onClose: () => void;
}

type Step = 'AUTH' | 'SELECT_CALENDAR' | 'SELECT_EVENTS' | 'IMPORTING';

const CalendarImportModal: FC<CalendarImportModalProps> = ({ onClose }) => {
    const { events: plannerEvents, setEvents } = usePlanner(); // Get existing events to append
    const [step, setStep] = useState<Step>('AUTH');
    const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
    const [selectedCalendarId, setSelectedCalendarId] = useState<string | null>(null);
    const [eligibleEvents, setEligibleEvents] = useState<GoogleEvent[]>([]);
    const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Auto-start auth if we think we might already have a session (or just wait for user click)
    // For now, let's wait for user click to be explicit.

    const handleAuth = async () => {
        setLoading(true);
        setError(null);
        try {
            await calendarService.authenticate();
            const cals = await calendarService.listCalendars();
            setCalendars(cals);
            setStep('SELECT_CALENDAR');
        } catch (err) {
            console.error(err);
            setError("Failed to connect to Google Calendar. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const handleCalendarSelect = async (calId: string) => {
        setSelectedCalendarId(calId);
        setLoading(true);
        setError(null);
        try {
            const allEvents = await calendarService.listEvents(calId);

            // Filter > 12 hours
            const filtered = allEvents.filter(ev => {
                const duration = CalendarService.getDurationInHours(ev);
                return duration >= 12;
            });

            console.log(`Found ${allEvents.length} events, ${filtered.length} eligible (>12h).`);

            if (filtered.length === 0) {
                setError("No long duration events (>12h) found in the next 12 months for this calendar.");
                // Ensure we stay on this step or allow picking another calendar? 
                // Let's stay here but showing error allows user to pick another.
                setLoading(false);
                return;
            }

            setEligibleEvents(filtered);
            // Select all by default
            setSelectedEventIds(new Set(filtered.map(e => e.id)));
            setStep('SELECT_EVENTS');
        } catch (err) {
            console.error(err);
            setError("Failed to fetch events.");
        } finally {
            setLoading(false);
        }
    };

    const toggleEvent = (id: string) => {
        const newSet = new Set(selectedEventIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedEventIds(newSet);
    };

    const toggleAll = () => {
        if (selectedEventIds.size === eligibleEvents.length) {
            setSelectedEventIds(new Set());
        } else {
            setSelectedEventIds(new Set(eligibleEvents.map(e => e.id)));
        }
    };

    const handleImport = () => {
        setStep('IMPORTING');
        try {
            // Convert to PlannerEvent
            const newEvents: PlannerEvent[] = [];

            eligibleEvents.forEach(ev => {
                if (!selectedEventIds.has(ev.id)) return;

                const startD = ev.start.dateTime ? new Date(ev.start.dateTime) : new Date(ev.start.date!);
                const endD = ev.end.dateTime ? new Date(ev.end.dateTime) : new Date(ev.end.date!);

                // Handle exclusive end date for full day events if needed? 
                // Google full day events end on the NEXT day (exclusive). 
                // But our planner might want inclusive. 
                // Let's check `calendarUtils`. If `start: string` and `end: string` are inclusive ranges.
                // Usually Planner apps use Inclusive ranges visually.
                // Let's assume inclusive for now. If it's a full day event, end might be D+1. 
                // We should subtract 1 second or similar to get the actual "end day".

                let effectiveEnd = endD;
                if (!ev.end.dateTime && ev.end.date) {
                    // Full day event, end is exclusive. Subtract 1ms to get previous day.
                    effectiveEnd = new Date(endD.getTime() - 1);
                }

                // Format to YYYY-MM-DD
                const startStr = toDateStr(startD.getFullYear(), startD.getMonth(), startD.getDate());
                const endStr = toDateStr(effectiveEnd.getFullYear(), effectiveEnd.getMonth(), effectiveEnd.getDate());

                // Random color from the 7 palette options? Or default?
                // Let's pick a random color index 0-6
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
            onClose(); // Done!
            alert(`Successfully imported ${newEvents.length} events!`);
        } catch (err) {
            console.error(err);
            setError("Failed to import events.");
            setStep('SELECT_EVENTS');
        }
    };

    // Render Steps
    const renderContent = () => {
        if (step === 'AUTH') {
            return (
                <div style={{ textAlign: 'center', padding: '2rem' }}>
                    <p style={{ marginBottom: '1.5rem', opacity: 0.8 }}>
                        Connect your Google Calendar to import holidays, vacations, or long events directly into your planner.
                    </p>
                    {error && <div className="error-msg" style={{ color: 'var(--danger)', marginBottom: '1rem' }}>{error}</div>}
                    <button className="login-google-btn" onClick={handleAuth} disabled={loading}>
                        {loading ? 'Connecting...' : 'Connect Google Calendar'}
                    </button>
                    <div style={{ marginTop: '1rem', fontSize: '0.85rem', opacity: 0.6 }}>
                        We will only read your calendar events. Nothing is stored on our servers.
                    </div>
                </div>
            );
        }

        if (step === 'SELECT_CALENDAR') {
            return (
                <div className="cal-list">
                    <h4>Select a Calendar</h4>
                    {error && <div className="error-msg" style={{ color: 'var(--danger)', marginBottom: '1rem' }}>{error}</div>}
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '2rem' }}>Loading events...</div>
                    ) : (
                        <div className="list-group">
                            {calendars.map(cal => (
                                <button
                                    key={cal.id}
                                    className="list-item-btn"
                                    onClick={() => handleCalendarSelect(cal.id)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        width: '100%',
                                        padding: '10px',
                                        marginBottom: '5px',
                                        border: '1px solid var(--border)',
                                        borderRadius: '8px',
                                        background: 'var(--bg-card)',
                                        cursor: 'pointer',
                                        gap: '10px'
                                    }}
                                >
                                    <div style={{
                                        width: '12px', height: '12px', borderRadius: '50%',
                                        backgroundColor: cal.backgroundColor || '#4285F4'
                                    }}></div>
                                    <span>{cal.summary}</span>
                                    {cal.primary && <span style={{ fontSize: '0.7rem', opacity: 0.6, marginLeft: 'auto' }}>Primary</span>}
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
                        <h4>Select Events to Import</h4>
                        <button className="btn-text" onClick={toggleAll}>
                            {selectedEventIds.size === eligibleEvents.length ? 'Deselect All' : 'Select All'}
                        </button>
                    </div>

                    <div className="event-list-scroller" style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
                        {eligibleEvents.map(ev => {
                            const isSelected = selectedEventIds.has(ev.id);
                            const start = ev.start.dateTime ? new Date(ev.start.dateTime) : new Date(ev.start.date!);
                            const dateStr = start.toLocaleDateString();
                            const dur = Math.round(CalendarService.getDurationInHours(ev));

                            return (
                                <div
                                    key={ev.id}
                                    onClick={() => toggleEvent(ev.id)}
                                    style={{
                                        padding: '10px',
                                        borderBottom: '1px solid var(--border)',
                                        background: isSelected ? 'var(--bg-active)' : 'transparent',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        gap: '10px'
                                    }}
                                >
                                    <input type="checkbox" checked={isSelected} readOnly />
                                    <div>
                                        <div style={{ fontWeight: 500 }}>{ev.summary || '(No Title)'}</div>
                                        <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>{dateStr} • {dur} hours</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                        <button className="btn-secondary" onClick={() => setStep('SELECT_CALENDAR')}>Back</button>
                        <button className="btn-primary" onClick={handleImport} disabled={selectedEventIds.size === 0}>
                            Import {selectedEventIds.size} Events
                        </button>
                    </div>
                </div>
            );
        }

        return null;
    };

    return (
        <div className="modal-overlay" onMouseDown={(e: React.MouseEvent) => e.target === e.currentTarget && onClose()}>
            <div className="modal bounce-in" style={{ maxWidth: '500px' }}>
                <div className="modal-header">
                    <h3>Import from Calendar</h3>
                    <button onClick={onClose} className="close-btn">&times;</button>
                </div>
                <div className='settings-content' style={{ padding: '20px' }}>
                    {renderContent()}
                </div>
            </div>
        </div>
    );
};

export default CalendarImportModal;
