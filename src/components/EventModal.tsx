import React, { FC, useState, useEffect, useRef } from 'react';
import { monthNames, EventRange } from '../utils/calendarUtils';
import { useTheme } from '../hooks/useTheme';

interface EventModalProps {
    range: EventRange;
    onClose: () => void;
    onSave: (title: string, colorIndex: number) => void;
}

const EventModal: FC<EventModalProps> = ({ range, onClose, onSave }) => {
    const [title, setTitle] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const palette = useTheme();

    useEffect(() => {
        if (inputRef.current) inputRef.current.focus();

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const handleSave = () => onSave(title, selectedIndex);

    return (
        <div className="modal-overlay" onMouseDown={(e: React.MouseEvent) => e.target === e.currentTarget && onClose()}>
            <div className="modal bounce-in">
                <h3>Add Event</h3>
                <p className="modal-meta">
                    {range.start.day} {monthNames[range.start.month]} - {range.end.day} {monthNames[range.end.month]}
                </p>

                <input
                    ref={inputRef}
                    type="text"
                    placeholder="Event Name"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSave()}
                    className="modal-input"
                />

                <div className="color-options">
                    {palette.map((c, idx) => (
                        <div
                            key={idx}
                            className={`color-circle ${selectedIndex === idx ? 'active' : ''}`}
                            style={{ backgroundColor: c }}
                            onClick={() => setSelectedIndex(idx)}
                        />
                    ))}
                </div>

                <div className="modal-actions">
                    <button onClick={onClose} className="btn-text">Cancel</button>
                    <button onClick={handleSave} className="btn-primary" style={{ backgroundColor: palette[selectedIndex] }}>Save</button>
                </div>
            </div>
        </div>
    );
};

export default EventModal;
