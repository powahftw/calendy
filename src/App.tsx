import React, { useState, useEffect } from 'react';
import './App.css';
import { useAuth } from './AuthContext';
import LoginScreen from './LoginScreen';

// Hooks
import usePlannerPersistence from './hooks/usePlannerPersistence';
import useDragSelection from './hooks/useDragSelection';

// Components
import MonthColumn from './components/MonthColumn';
import SettingsModal from './components/SettingsModal';
import EventModal from './components/EventModal';
import EventListModal from './components/EventListModal';

// Utils
import {
  getThemeColors,
  uid,
  toDateStr,
  daysOfWeek,
  PlannerEvent,
  EventRange,
  RangeDate,
  getDaysInMonth,
  calculateViewProgress
} from './utils/calendarUtils';

function App() {
  const { user, loading: authLoading, signOut } = useAuth();

  // Custom Hook for Persistence & Settings
  const {
    year, setYear,
    monthsToShow, setMonthsToShow,
    theme, setTheme,
    highlightToday, setHighlightToday,
    showWeekends, setShowWeekends,
    showDayProgress, setShowDayProgress,
    events, setEvents
  } = usePlannerPersistence(user);

  // Custom Hook for Range Selection
  const {
    startDrag,
    updateDrag,
    endDrag,
    isHighlighted
  } = useDragSelection(year);

  // App UI State
  const [weekdayAlign, setWeekdayAlign] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [modalType, setModalType] = useState<'create' | 'list' | null>(null);

  // Selection State
  const [selectedDateEvents, setSelectedDateEvents] = useState<PlannerEvent[]>([]);
  const [tempRange, setTempRange] = useState<EventRange | null>(null);
  const [clickedDate, setClickedDate] = useState<RangeDate | null>(null);

  // Derived State
  const currentColors = getThemeColors(theme);
  const maxRows = 37;

  // Effects
  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
  }, [theme]);

  // Handlers
  const handleMouseUp = () => {
    endDrag((range) => {
      setTempRange(range);
      setModalType('create');
      setSelectedDateEvents([]);
    });
  };

  const handleEventClickWithDate = (e: React.MouseEvent, allEventsOnDay: PlannerEvent[], m: number, d: number) => {
    e.stopPropagation();
    setSelectedDateEvents(allEventsOnDay);
    setClickedDate({ year, month: m, day: d });
    setModalType('list');
  };

  const saveNewEvent = (title: string, colorIndex: number) => {
    if (!tempRange) return;
    if (!title.trim()) title = "New Event";
    const startStr = toDateStr(tempRange.start.year, tempRange.start.month, tempRange.start.day);
    const endStr = toDateStr(tempRange.end.year, tempRange.end.month, tempRange.end.day);

    const newEvent: PlannerEvent = {
      id: uid(),
      title,
      start: startStr,
      end: endStr,
      color: colorIndex
    };
    setEvents([...events, newEvent]);
    setModalType(null);
  };

  const handleUpdateEvent = (updatedEvent: PlannerEvent) => {
    setEvents(events.map(ev => ev.id === updatedEvent.id ? updatedEvent : ev));
    setSelectedDateEvents(selectedDateEvents.map(ev => ev.id === updatedEvent.id ? updatedEvent : ev));
  };

  const handleDeleteEvent = (id: string) => {
    setEvents(events.filter(ev => ev.id !== id));
    const newSelected = selectedDateEvents.filter(ev => ev.id !== id);
    setSelectedDateEvents(newSelected);
    if (newSelected.length === 0) setModalType(null);
  };

  const handleAddFromList = () => {
    if (!clickedDate) return;
    const dateStr = toDateStr(clickedDate.year, clickedDate.month, clickedDate.day);
    const newEvent: PlannerEvent = {
      id: uid(),
      title: "New Event",
      start: dateStr,
      end: dateStr,
      color: 0
    };
    setEvents([...events, newEvent]);
    setSelectedDateEvents([...selectedDateEvents, newEvent]);
  };

  const clearAll = () => {
    if (window.confirm("Clear all events?")) setEvents([]);
  };

  const todayObj = new Date();
  const todayData = {
    todayYear: todayObj.getFullYear(),
    todayMonth: todayObj.getMonth(),
    todayDay: todayObj.getDate()
  };

  if (authLoading) {
    return (
      <div className="app-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
      </div>
    );
  }

  // Day Progress Calculation
  let dayProgressStr = "";
  if (showDayProgress) {
    const { current, total } = calculateViewProgress(year, monthsToShow, todayObj);
    dayProgressStr = `${current} / ${total}`;
  }

  if (!user) return <LoginScreen />;

  return (
    <div className="app-container" onMouseUp={handleMouseUp}>
      <div className="app-header">
        <div className="header-spacer">
          {showDayProgress && (
            <span style={{
              fontSize: '0.85rem',
              color: 'var(--text-secondary)',
              fontFamily: "'Inter', sans-serif",
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>
              {dayProgressStr}
            </span>
          )}
        </div>
        <h1 className="app-year">{year}</h1>
        <div className="header-spacer" style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            className="header-settings-btn"
            onClick={() => setShowSettings(true)}
            title="Settings"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
          </button>
        </div>
      </div>

      <div className="planner-scroll-area">
        <div className="planner-grid">
          {weekdayAlign && (
            <div className="legend-col">
              <div className="month-header unselectable"></div>
              {Array.from({ length: maxRows }).map((_, i) => (
                <div key={i} className="day-cell legend-cell">
                  {daysOfWeek[i % 7]}
                </div>
              ))}
            </div>
          )}

          {Array.from({ length: monthsToShow }).map((_, monthIndex) => (
            <MonthColumn
              key={monthIndex}
              year={year}
              monthIndex={monthIndex}
              events={events}
              currentColors={currentColors}
              onMouseDown={startDrag}
              onMouseEnter={updateDrag}
              isHighlighted={isHighlighted}
              onEventClick={handleEventClickWithDate}
              weekdayAlign={weekdayAlign}
              maxRows={maxRows}
              today={todayData}
              highlightToday={highlightToday}
              showWeekends={showWeekends}
            />
          ))}
        </div>
      </div>

      {modalType === 'create' && tempRange && (
        <EventModal
          range={tempRange}
          onClose={() => setModalType(null)}
          onSave={saveNewEvent}
          palette={currentColors}
        />
      )}

      {modalType === 'list' && clickedDate && (
        <EventListModal
          events={selectedDateEvents}
          date={clickedDate}
          onClose={() => setModalType(null)}
          onDelete={handleDeleteEvent}
          onUpdate={handleUpdateEvent}
          onAdd={handleAddFromList}
          palette={currentColors}
        />
      )}

      {showSettings && (
        <SettingsModal
          year={year} setYear={setYear}
          monthsToShow={monthsToShow} setMonthsToShow={setMonthsToShow}
          theme={theme} setTheme={setTheme}
          weekdayAlign={weekdayAlign} setWeekdayAlign={setWeekdayAlign}
          highlightToday={highlightToday} setHighlightToday={setHighlightToday}
          showWeekends={showWeekends} setShowWeekends={setShowWeekends}
          showDayProgress={showDayProgress} setShowDayProgress={setShowDayProgress}
          clearAll={clearAll}
          onClose={() => setShowSettings(false)}
          user={user}
          onSignOut={signOut}
        />
      )}
    </div>
  );
}

export default App;
