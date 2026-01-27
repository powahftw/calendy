import React, { createContext, useContext, ReactNode } from 'react';

interface PlannerInteractionContextValue {
    activeEventId: string | null;
    setActiveEventId: (id: string | null) => void;
}

const PlannerInteractionContext = createContext<PlannerInteractionContextValue | undefined>(undefined);

export const usePlannerInteraction = () => {
    const context = useContext(PlannerInteractionContext);
    if (!context) {
        throw new Error('usePlannerInteraction must be used within a PlannerInteractionProvider');
    }
    return context;
};

interface PlannerInteractionProviderProps {
    value: PlannerInteractionContextValue;
    children: ReactNode;
}

export const PlannerInteractionProvider: React.FC<PlannerInteractionProviderProps> = ({ value, children }) => {
    return (
        <PlannerInteractionContext.Provider value={value}>
            {children}
        </PlannerInteractionContext.Provider>
    );
};
