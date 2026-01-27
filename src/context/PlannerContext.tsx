import React, { ReactNode } from 'react';
import { User } from 'firebase/auth';
import { usePlannerData } from './PlannerDataContext'; // Kept for types?
import { PlannerInteractionProvider, usePlannerInteraction } from './PlannerInteractionContext';
import { PlannerDisplayProvider, usePlannerDisplay } from './PlannerDisplayContext';
import { usePlannerMeta } from './PlannerMetaContext';
import { usePlannerEvents } from './PlannerEventsContext';

// Export everything for convenience
export * from './PlannerDataContext';
export * from './PlannerInteractionContext';
export * from './PlannerDisplayContext';

interface PlannerProviderProps {
    user: User | null;
    children: ReactNode;
}

// Re-export AppProvider as PlannerProvider for backward compatibility
import { AppProvider } from './AppProvider';

export const PlannerProvider: React.FC<PlannerProviderProps> = ({ user, children }) => {
    return <AppProvider user={user}>{children}</AppProvider>;
};

// Facade for backward compatibility
// Facade for backward compatibility
export const usePlanner = () => {
    const meta = usePlannerMeta();
    const events = usePlannerEvents();
    const interaction = usePlannerInteraction();

    return {
        ...meta,
        ...events,
        ...interaction,
        // Re-construct eventMap if check needed? No, events has it.
    };
};
