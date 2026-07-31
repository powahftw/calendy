import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { usePlannerMeta } from '../context/PlannerMetaContext';
import { usePlannerEvents } from '../context/PlannerEventsContext';
import PlannerGrid from './PlannerGrid';
import AppHeader from './AppHeader';
import SettingsModal from './SettingsModal';
import CalendarPicker from './CalendarPicker';

interface PlannerViewProps {
    user: User;
    signOut: () => void;
}

const PlannerView: React.FC<PlannerViewProps> = ({ user, signOut }) => {
    const { theme } = usePlannerMeta();
    const { connection, loading, error } = usePlannerEvents();
    const [showSettings, setShowSettings] = useState(false);
    const [todayInView, setTodayInView] = useState(false);

    useEffect(() => {
        document.body.setAttribute('data-theme', theme);
    }, [theme]);

    // Until a calendar is chosen there is nothing to draw, so the picker takes
    // over the whole screen instead of hiding inside settings.
    const needsCalendar = connection.status !== 'connected' && !connection.selectionLoading;

    return (
        <div className="app-container">
            <AppHeader
                todayInView={todayInView}
                onSettingsClick={() => setShowSettings(true)}
            />

            {needsCalendar ? (
                <CalendarPicker connection={connection} variant="full" />
            ) : (
                <>
                    {error && (
                        <div className="planner-banner" role="status">
                            <span>{error}</span>
                            {connection.status === 'disconnected' ? (
                                <button className="btn-text" onClick={() => void connection.connect()}>
                                    Reconnect
                                </button>
                            ) : null}
                        </div>
                    )}

                    {loading && (
                        <div className="planner-banner planner-banner-quiet" role="status">
                            Loading events from Google Calendar…
                        </div>
                    )}

                    <PlannerGrid setTodayInView={setTodayInView} />
                </>
            )}

            {showSettings && (
                <SettingsModal
                    onClose={() => setShowSettings(false)}
                    user={user}
                    onSignOut={signOut}
                />
            )}
        </div>
    );
};

export default PlannerView;
