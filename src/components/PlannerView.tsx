import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { usePlanner } from '../context/PlannerContext';
import PlannerGrid from './PlannerGrid';
import AppHeader from './AppHeader';
import SettingsModal from './SettingsModal';
import CalendarPicker from './CalendarPicker';

interface PlannerViewProps {
    user: User;
    signOut: () => void;
}

const PlannerView: React.FC<PlannerViewProps> = ({ user, signOut }) => {
    const { theme, connection, loading, error } = usePlanner();
    const [showSettings, setShowSettings] = useState(false);
    const [todayInView, setTodayInView] = useState(false);

    useEffect(() => {
        document.body.setAttribute('data-theme', theme);
    }, [theme]);

    // The picker only takes over when there is genuinely nothing to draw. A
    // lapsed token is not that: the cached events are still worth looking at,
    // so the grid stays up and the banner offers to reconnect instead.
    const needsCalendar = !connection.selection && !connection.selectionLoading;
    const isDisconnected = connection.status === 'disconnected';

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
                    {(error || isDisconnected) && (
                        <div className="planner-banner" role="status">
                            {/* With events cached, nothing sets an error - the
                                banner is the only sign access has lapsed. */}
                            <span>{error || 'Google Calendar access expired. Showing your last cached events.'}</span>
                            {isDisconnected && (
                                <button className="btn-text" onClick={() => void connection.connect()}>
                                    Reconnect
                                </button>
                            )}
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
