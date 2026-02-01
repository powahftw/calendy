import React, { FC, useState, useEffect, useRef } from 'react';
import { monthNames, EventRange, PlannerEvent } from '../utils/calendarUtils';
import { useTheme } from '../hooks/useTheme';
import { renderCustomEmoji } from '../utils/emojiUtils';

interface EventModalProps {
    range: EventRange;
    // Optional event prop if editing existing event (not passed currently but good for future)
    event?: PlannerEvent;
    onClose: () => void;
    onSave: (title: string, colorIndex: number, icon?: string) => void;
}

const EventModal: FC<EventModalProps> = ({ range, event, onClose, onSave }) => {
    const [title, setTitle] = useState(event?.title || '');
    const [colorIndex, setSelectedIndex] = useState(event?.color || 0);
    const [icon, setIcon] = useState(event?.icon || '');

    const icons = ['', '🇨🇭', '🇮🇹', '⚠️', '❓'];
    const inputRef = useRef<HTMLInputElement>(null);
    const palette = useTheme();

    const dateStr = `${range.start.day} ${monthNames[range.start.month]} - ${range.end.day} ${monthNames[range.end.month]}`;

    useEffect(() => {
        if (inputRef.current) inputRef.current.focus();

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const handleSave = () => {
        onSave(title, colorIndex, icon);
    };

    const cycleIcon = () => {
        const nextIdx = (icons.indexOf(icon) + 1) % icons.length;
        setIcon(icons[nextIdx]);
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
                        ref={inputRef}
                        type="text"
                        placeholder="Event Name"
                        className="modal-input"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        autoFocus
                    />
                    <button className="emoji-picker-btn" onClick={cycleIcon} title="Cycle Icon">
                        {icon ? renderCustomEmoji(icon) : <span style={{ opacity: 0.3 }}>☺</span>}
                    </button>
                </div>

                <div className="color-options">
                    {palette.map((c, idx) => {
                        let circleClass = `color-circle ${colorIndex === idx ? 'active' : ''}`;
                        const extraStyle: React.CSSProperties & Record<string, string> = {};

                        // Apply special pattern classes or styles for indices 5 and 6
                        if (idx === 5) {
                            circleClass += ' event-striped';
                            extraStyle['--event-color-bg'] = `${c}30`;
                            extraStyle['--event-color-stripe'] = `${c}60`;
                        } else if (idx === 6) {
                            circleClass += ' event-dotted';
                            extraStyle['--event-color-bg'] = `${c}30`;
                            extraStyle['--event-color-dot'] = `${c}`;
                        } else if (idx === 7) { // Transparent
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
