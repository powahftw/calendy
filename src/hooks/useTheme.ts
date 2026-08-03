import { useMemo } from 'react';
import { usePlanner } from '../context/PlannerContext';
import { getThemeColors } from '../utils/calendarUtils';

/** The active theme's colour palette, indexed by an event's colour. */
export const useTheme = () => {
    const { theme } = usePlanner();
    return useMemo(() => getThemeColors(theme), [theme]);
};
