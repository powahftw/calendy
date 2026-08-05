import React, { FC } from 'react';
import { CalendarConnection, getCalendarName } from '../hooks/useCalendarConnection';
import { isGoogleCalendarConfigured } from '../services/CalendarService';
import { getSelectedCalendarIds } from '../firestoreSync';

interface CalendarPickerProps {
    connection: CalendarConnection;
    /** `full` takes over the screen before a calendar is chosen. */
    variant: 'full' | 'inline';
}

const CalendarIcon = () => (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="16" y1="2" x2="16" y2="6"></line>
        <line x1="8" y1="2" x2="8" y2="6"></line>
        <line x1="3" y1="10" x2="21" y2="10"></line>
    </svg>
);

const CalendarList: FC<CalendarPickerProps> = ({ connection }) => {
    const { calendars, calendarsLoading, selection } = connection;
    const selectedIds = getSelectedCalendarIds(selection);

    if (calendarsLoading && calendars.length === 0) {
        return <p className="calendar-picker-copy">Loading your calendars…</p>;
    }

    if (calendars.length === 0) {
        return <p className="calendar-picker-copy">No calendars were returned for this account.</p>;
    }

    return (
        <ul className="calendar-list">
            {calendars.map((calendar) => {
                const isSelected = selectedIds.includes(calendar.id);

                return (
                    <li key={calendar.id}>
                        <button
                            type="button"
                            className={`calendar-list-item ${isSelected ? 'is-selected' : ''}`}
                            aria-pressed={isSelected}
                            onClick={async () => {
                                await connection.toggleCalendar(calendar);
                            }}
                        >
                            <span
                                className="calendar-list-swatch"
                                style={{ backgroundColor: calendar.backgroundColor || 'var(--accent-color)' }}
                                aria-hidden="true"
                            />
                            <span className="calendar-list-name">{getCalendarName(calendar)}</span>
                            {calendar.primary && <span className="calendar-list-tag">Primary</span>}
                            <span className={`calendar-list-check ${isSelected ? 'is-checked' : ''}`} aria-hidden="true">
                                {isSelected ? '✓' : ''}
                            </span>
                        </button>
                    </li>
                );
            })}
        </ul>
    );
};

/**
 * Picks which Google Calendar to visualise. Doubles as the connect screen:
 * before there is a token there is nothing to list, so the same surface asks
 * for access first.
 */
const CalendarPicker: FC<CalendarPickerProps> = (props) => {
    const { connection, variant } = props;
    const isDisconnected = connection.status === 'disconnected';

    const body = (
        <>
            {!isGoogleCalendarConfigured && (
                <p className="calendar-picker-copy calendar-picker-copy-danger">
                    Google Calendar is not configured for this deployment. Set
                    <code> VITE_GOOGLE_CALENDAR_CLIENT_ID</code> and reload.
                </p>
            )}

            {isDisconnected ? (
                <>
                    <p className="calendar-picker-copy">
                        Calendy needs read-only access to your Google Calendar. It can see your
                        calendars and events, and can never change them.
                    </p>
                    <button
                        className="btn-primary-outline btn-icon-with-text calendar-picker-connect"
                        onClick={() => void connection.connect()}
                        disabled={connection.connecting || !isGoogleCalendarConfigured}
                    >
                        {connection.connecting ? 'Connecting…' : 'Connect Google Calendar'}
                    </button>
                </>
            ) : (
                <CalendarList {...props} />
            )}

            {connection.error && (
                <div className="error-msg calendar-picker-error">{connection.error}</div>
            )}
        </>
    );

    if (variant === 'inline') {
        return <div className="calendar-picker-inline">{body}</div>;
    }

    return (
        <div className="calendar-picker-full">
            <div className="calendar-picker-card">
                <div className="calendar-picker-icon"><CalendarIcon /></div>
                <h2 className="calendar-picker-title">
                    {isDisconnected ? 'Connect your calendar' : 'Choose a calendar'}
                </h2>
                {body}
            </div>
        </div>
    );
};

export default CalendarPicker;
