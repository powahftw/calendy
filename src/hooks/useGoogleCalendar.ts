import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { CalendarService, GoogleCalendar, GoogleEvent } from '../services/CalendarService';

export const useGoogleCalendar = () => {
    const calendarService = useMemo(() => new CalendarService(), []);
    const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
    const [eligibleEvents, setEligibleEvents] = useState<GoogleEvent[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const connect = async () => {
        setLoading(true);
        setError(null);
        try {
            await calendarService.authenticate();
            const cals = await calendarService.listCalendars();
            setCalendars(cals);
            return cals;
        } catch (err) {
            console.error(err);
            const message = err instanceof Error ? err.message : 'Failed to connect to Google Calendar. Please try again.';
            setError(message);
            toast.error(message);
            return null;
        } finally {
            setLoading(false);
        }
    };

    const fetchEvents = async (calendarId: string) => {
        setLoading(true);
        setError(null);
        try {
            const allEvents = await calendarService.listEvents(calendarId);
            const filtered = allEvents.filter(ev => CalendarService.getDurationInHours(ev) >= 12);

            if (filtered.length === 0) {
                setError('No events longer than 12 hours found in the next 12 months.');
                toast.error('No suitable events found.');
                setEligibleEvents([]);
                return null;
            }

            setEligibleEvents(filtered);
            return filtered;
        } catch (err) {
            console.error(err);
            setError('Failed to fetch events.');
            toast.error('Failed to fetch events.');
            return null;
        } finally {
            setLoading(false);
        }
    };

    return {
        calendars,
        eligibleEvents,
        loading,
        error,
        connect,
        fetchEvents
    };
};
