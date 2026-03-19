import React, { FC, useState } from 'react';
import {
    DOTTED_COLOR_INDEX,
    EventRange,
    PlannerEvent,
    STRIPED_COLOR_INDEX,
    TRANSPARENT_COLOR_INDEX,
    formatDateRange,
    toDateStr
} from '../utils/calendarUtils';
import { useTheme } from '../hooks/useTheme';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface EventModalProps {
    range: EventRange;
    event?: PlannerEvent;
    onClose: () => void;
    onSave: (title: string, colorIndex: number, icon?: string) => void;
}

export const EVENT_ICONS = ['', '⚠️', '❓', '🌍', '🗺️', '🇨🇭', '🇮🇹', '🇬🇧', '🇪🇸'];

const EventModal: FC<EventModalProps> = ({ range, event, onClose, onSave }) => {
    const [title, setTitle] = useState(event?.title || '');
    const [colorIndex, setSelectedIndex] = useState(event?.color || 0);
    const [icon, setIcon] = useState(event?.icon || '');
    const palette = useTheme();

    const startDateStr = toDateStr(range.start.year, range.start.month, range.start.day);
    const endDateStr = toDateStr(range.end.year, range.end.month, range.end.day);
    const dateStr = formatDateRange(startDateStr, endDateStr, 'dayMonth');

    useEscapeKey(onClose);

    const handleSave = () => {
        onSave(title, colorIndex, icon);
    };

    const cycleIcon = () => {
        const nextIdx = (EVENT_ICONS.indexOf(icon) + 1) % EVENT_ICONS.length;
        setIcon(EVENT_ICONS[nextIdx]);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <div className="header-text">
                        <h3>{event ? 'Edit Event' : 'Add Event'}</h3>
                        <div className="modal-date">{dateStr}</div>
                    </div>
                    <button onClick={onClose} className="close-btn">&times;</button>
                </div>

                <div className="input-row">
                    <input
                        type="text"
                        placeholder="Event Name"
                        className="modal-input"
                        value={title}
                        maxLength={100}
                        onChange={(e) => setTitle(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                        autoFocus
                    />
                    <button className="emoji-picker-btn" onClick={cycleIcon} title="Cycle Icon">
                        {icon ? icon : <span style={{ opacity: 0.3 }}>☺</span>}
                    </button>
                </div>

                <div className="color-options">
                    {palette.map((c, idx) => {
                        let circleClass = `color-circle ${colorIndex === idx ? 'active' : ''}`;
                        const extraStyle: React.CSSProperties & Record<string, string> = {};

                        if (idx === STRIPED_COLOR_INDEX) {
                            circleClass += ' event-striped';
                            extraStyle['--event-color-bg'] = `${c}30`;
                            extraStyle['--event-color-stripe'] = `${c}60`;
                        } else if (idx === DOTTED_COLOR_INDEX) {
                            circleClass += ' event-dotted';
                            extraStyle['--event-color-bg'] = `${c}30`;
                            extraStyle['--event-color-dot'] = `${c}`;
                        } else if (idx === TRANSPARENT_COLOR_INDEX) {
                            circleClass += ' color-transparent';
                        }

                        return (
                            <div
                                key={idx}
                                className={circleClass}
                                style={{ backgroundColor: c, ...extraStyle }}
                                onClick={() => setSelectedIndex(idx)}
                            />
                        );
                    })}
                </div>

                <div className="modal-actions">
                    <button onClick={onClose} className="btn-text">Cancel</button>
                    <button onClick={handleSave} className="btn-primary" style={{ backgroundColor: palette[colorIndex] === 'transparent' ? '#3b82f6' : palette[colorIndex] }}>Save</button>
                </div>
            </div>
        </div>
    );
};

export default EventModal;
