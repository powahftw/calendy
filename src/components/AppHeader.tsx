import React, { useEffect, useRef, useState } from 'react';
import { usePlanner } from '../context/PlannerContext';
import { calculateViewProgress, getYearLabel } from '../utils/calendarUtils';

interface AppHeaderProps {
    todayInView: boolean;
    onSettingsClick: () => void;
}

const AppHeader: React.FC<AppHeaderProps> = ({ todayInView, onSettingsClick }) => {
    const { year, startMonth, showDayProgress, monthsToShow, navigate, setYear, setStartMonth, syncStatus } = usePlanner();
    const [showPercentage, setShowPercentage] = useState(false);
    const [isNavPinnedOpen, setIsNavPinnedOpen] = useState(false);
    const [shouldScrollToToday, setShouldScrollToToday] = useState(false);
    const yearNavRef = useRef<HTMLDivElement>(null);

    const scrollTodayIntoView = () => {
        const todayEl = document.querySelector('.today-marker');
        if (todayEl) {
            todayEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        }
    };

    useEffect(() => {
        if (!isNavPinnedOpen) {
            return;
        }

        const handlePointerDown = (event: PointerEvent) => {
            if (yearNavRef.current && !yearNavRef.current.contains(event.target as Node)) {
                setIsNavPinnedOpen(false);
            }
        };

        document.addEventListener('pointerdown', handlePointerDown);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
        };
    }, [isNavPinnedOpen]);

    useEffect(() => {
        if (!shouldScrollToToday) {
            return;
        }

        const frame = window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
                scrollTodayIntoView();
                setShouldScrollToToday(false);
            });
        });

        return () => {
            window.cancelAnimationFrame(frame);
        };
    }, [shouldScrollToToday, year, startMonth, monthsToShow]);

    const handleBackToToday = () => {
        const today = new Date();
        const currentRangeStart = year * 12 + startMonth;
        const currentRangeEnd = currentRangeStart + monthsToShow - 1;
        const todayIndex = today.getFullYear() * 12 + today.getMonth();
        const isTodayInRange = todayIndex >= currentRangeStart && todayIndex <= currentRangeEnd;

        if (!isTodayInRange) {
            setYear(today.getFullYear());
            setStartMonth(today.getMonth());
            setShouldScrollToToday(true);
            return;
        }

        scrollTodayIntoView();
    };

    let dayProgressStr = "";
    if (showDayProgress) {
        const todayObj = new Date();
        const { current, total } = calculateViewProgress(year, startMonth, monthsToShow, todayObj);

        if (showPercentage) {
            const pct = ((current / total) * 100).toFixed(1);
            dayProgressStr = `${pct}%`;
        } else {
            dayProgressStr = `${current} / ${total}`;
        }
    }

    const showSyncDot = syncStatus === 'offline' || syncStatus === 'pending';
    const syncTitle = syncStatus === 'offline'
        ? 'Offline. Changes are saved locally and will sync when you reconnect.'
        : syncStatus === 'pending'
            ? 'Online again, syncing your local changes.'
            : undefined;

    return (
        <div className="app-header">
            <div className="header-spacer left">
                <div className="header-status-cluster" title={syncTitle}>
                    {showDayProgress && (
                        <span
                            className="day-progress"
                            onClick={() => setShowPercentage(!showPercentage)}
                            title="Click to toggle %"
                        >
                            {dayProgressStr}
                        </span>
                    )}
                    {showSyncDot && (
                        <span
                            className="sync-status-dot"
                            role="status"
                            aria-live="polite"
                            aria-label={syncTitle}
                        />
                    )}
                </div>
            </div>
            <div
                ref={yearNavRef}
                className={`app-year-nav ${isNavPinnedOpen ? 'nav-open' : ''}`}
                onMouseEnter={() => setIsNavPinnedOpen(true)}
                onMouseLeave={() => setIsNavPinnedOpen(false)}
            >
                <button
                    type="button"
                    className="header-nav-arrow header-nav-arrow-left"
                    onClick={() => navigate(-1)}
                    title="Previous Range"
                    aria-label="Previous range"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 18 9 12 15 6"></polyline>
                    </svg>
                </button>

                <button
                    type="button"
                    className="app-year-trigger"
                    onClick={() => setIsNavPinnedOpen(open => !open)}
                    aria-label="Toggle calendar navigation"
                    aria-expanded={isNavPinnedOpen}
                >
                    <span className="app-year">{getYearLabel(year, startMonth, monthsToShow)}</span>
                </button>

                <button
                    type="button"
                    className="header-nav-arrow header-nav-arrow-right"
                    onClick={() => navigate(1)}
                    title="Next Range"
                    aria-label="Next range"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                </button>
            </div>
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
