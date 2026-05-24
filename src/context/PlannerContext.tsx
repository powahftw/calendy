import { usePlannerInteraction } from './PlannerInteractionContext';
import { usePlannerMeta } from './PlannerMetaContext';
import { usePlannerEvents } from './PlannerEventsContext';

export * from './PlannerInteractionContext';

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
