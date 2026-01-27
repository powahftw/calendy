import { useMemo } from 'react';
import { usePlannerMeta } from '../context/PlannerMetaContext';
import { getThemeColors } from '../utils/calendarUtils';

export const useTheme = () => {
    const { theme } = usePlannerMeta();
    return useMemo(() => getThemeColors(theme), [theme]);
};
