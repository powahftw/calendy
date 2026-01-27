import { useEffect, useCallback } from 'react';
import { usePlannerEvents } from '../context/PlannerEventsContext';

export const useKeyboardShortcuts = () => {
    const { undo, canUndo } = usePlannerEvents();

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        // Ignore if typing in an input
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
            return;
        }

        // Undo: Ctrl + Z
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            if (canUndo) {
                undo();
            }
            return;
        }

    }, [undo, canUndo]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);
};
