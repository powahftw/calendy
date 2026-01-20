import { useMemo } from 'react';
import { usePlannerData } from '../context/PlannerContext';
import { getThemeColors } from '../utils/calendarUtils';

export const useTheme = () => {
    const { theme } = usePlannerData();
    return useMemo(() => getThemeColors(theme), [theme]);
};
