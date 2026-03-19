import React, { ReactNode } from 'react';
import { User } from 'firebase/auth';
import { usePlannerInteraction } from './PlannerInteractionContext';
import { usePlannerMeta } from './PlannerMetaContext';
import { usePlannerEvents } from './PlannerEventsContext';

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

export const usePlanner = () => {
    const meta = usePlannerMeta();
    const events = usePlannerEvents();
    const interaction = usePlannerInteraction();

    return {
        ...meta,
        ...events,
        ...interaction,
    };
};
