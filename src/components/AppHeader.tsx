import React from 'react';
import { usePlanner } from '../context/PlannerContext';
import { calculateViewProgress } from '../utils/calendarUtils';

interface AppHeaderProps {
    todayInView: boolean;
    onSettingsClick: () => void;
}

const AppHeader: React.FC<AppHeaderProps> = ({ todayInView, onSettingsClick }) => {
    const { year, showDayProgress, monthsToShow } = usePlanner();

    const handleBackToToday = () => {
        // Find the today cell
        const todayEl = document.querySelector('.today-marker');
        if (todayEl) {
            todayEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        }
    };

    let dayProgressStr = "";
    if (showDayProgress) {
        const todayObj = new Date();
        const { current, total } = calculateViewProgress(year, monthsToShow, todayObj);
        dayProgressStr = `${current} / ${total}`;
    }

    return (
        <div className="app-header">
            <div className="header-spacer left">
                {showDayProgress && (
                    <span className="day-progress">
                        {dayProgressStr}
                    </span>
                )}
            </div>
            <h1 className="app-year">{year}</h1>
            <div className="header-spacer right">
                {!todayInView && (
                    <button
                        className="header-settings-btn"
                        onClick={handleBackToToday}
                        title="Back to Today"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                    </button>
                )}

                <button
                    className="header-settings-btn"
                    onClick={onSettingsClick}
                    title="Settings"
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="3"></circle>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
                    </svg>
                </button>
            </div>
        </div>
    );
};

export default AppHeader;
