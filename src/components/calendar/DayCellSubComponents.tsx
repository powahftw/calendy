import React from 'react';
import { PlannerEvent, ProvisionalPattern, getProvisionalPattern, getProvisionalPatternStyles } from '../../utils/calendarUtils';

export const DayNumber: React.FC<{ value: number }> = ({ value }) => (
    <span className="day-num">{value}</span>
);

export const EventPreview: React.FC<{
    event: PlannerEvent;
    hasConflict: boolean;
    currentColors: string[];
}> = ({ event, hasConflict, currentColors }) => {
    const color = currentColors[event.color] || currentColors[0];
    const pattern = getProvisionalPattern(event.color, currentColors.length);
    const patternStyles = pattern ? getProvisionalPatternStyles(color, pattern, { opacityHex: '45', border: true }) : {};

    if (hasConflict) {
        return (
            <div className="event-overflow preview-overflow" style={{ pointerEvents: 'none', zIndex: 11 }}>
                <div className="overflow-lines">
                    <div
                        className="overflow-line"
                        style={{
                            backgroundColor: color,
                            opacity: 0.6,
                            border: '1px dashed rgba(255,255,255,0.4)',
                            boxSizing: 'border-box'
                        }}
                    />
                </div>
            </div>
        );
    }

    return (
        <div
            className="event-chip-common preview-chip-style"
            style={{
                backgroundColor: color + '45',
                borderLeft: `2px solid ${color}`,
                paddingLeft: event.emoji ? '6px' : '4px',
                ...patternStyles
            }}
        >
            {event.emoji && <span className="event-chip-emoji">{event.emoji}</span>}
            <span className="event-chip-title" style={{ color: 'var(--text-primary)', opacity: 0.8 }}>{event.title}</span>
        </div>
    );
};

export const EventShadow: React.FC<{
    event: PlannerEvent;
    hasOverflow: boolean;
    color: string;
    pattern?: ProvisionalPattern;
}> = ({ event, hasOverflow, color, pattern = null }) => (
    <div
        className="event-chip-common"
        style={{
            right: hasOverflow ? '6px' : '2px',
            paddingRight: hasOverflow ? '12px' : '4px',
            paddingLeft: event.emoji ? '6px' : '4px',
            backgroundColor: `${color}15`,
            borderLeft: `2px solid ${color}`,
            opacity: 0.25,
            zIndex: 2,
            pointerEvents: 'none',
            ...getProvisionalPatternStyles(
                color,
                pattern,
                { opacityHex: '15', border: true }
            )
        }}
    >
        {event.emoji && <span className="event-chip-emoji">{event.emoji}</span>}
        <span
            className="event-chip-title"
            style={{
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                width: '100%',
                userSelect: 'none'
            }}
        >
            {event.title}
        </span>
    </div>
);

export const OverflowIndicator: React.FC<{
    events: PlannerEvent[];
    onClick: (e: React.MouseEvent) => void;
    currentColors: string[];
}> = ({ events, onClick, currentColors }) => (
    <div
        className="event-overflow"
        onClick={onClick}
        onMouseDown={(e) => e.stopPropagation()}
    >
        <div className="overflow-lines">
            {events.map((ev) => (
                <div
                    key={ev.id}
                    className="overflow-line"
                    style={{ backgroundColor: currentColors[ev.color] || currentColors[0] }}
                />
            ))}
        </div>
    </div>
);
