import type { CSSProperties } from 'react';
import {
    DOTTED_COLOR_INDEX,
    STRIPED_COLOR_INDEX,
    TRANSPARENT_COLOR_INDEX
} from './calendarUtils';

type EventStyleProperties = CSSProperties & Record<`--event-${string}`, string>;

export const getEventStylePresentation = (styleIndex: number, palette: string[]) => {
    const fallbackColor = palette[0] || '#3b82f6';
    const color = palette[styleIndex] && palette[styleIndex] !== 'transparent'
        ? palette[styleIndex]
        : fallbackColor;
    const className = styleIndex === STRIPED_COLOR_INDEX
        ? 'event-style-striped'
        : styleIndex === DOTTED_COLOR_INDEX
            ? 'event-style-dotted'
            : styleIndex === TRANSPARENT_COLOR_INDEX
                ? 'event-style-transparent'
                : '';
    const style: EventStyleProperties = {
        '--event-color': color,
        '--event-color-bg': `${color}15`,
        '--event-color-pattern': `${color}35`,
        '--event-color-dot': `${color}80`
    };

    return { className, style };
};
