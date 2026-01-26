import { useEffect, useCallback } from 'react';
import { usePlannerEvents } from '../context/PlannerEventsContext';
import { usePlannerMeta } from '../context/PlannerMetaContext';

interface UseKeyboardShortcutsProps {
    onNewEvent?: () => void;
}

export const useKeyboardShortcuts = ({ onNewEvent }: UseKeyboardShortcutsProps) => {
    const { undo, canUndo } = usePlannerEvents();
    const { year, setYear } = usePlannerMeta();

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        // Ignore if typing in an input
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
            return;
        }

        // Undo: Ctrl + Z
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
            e.preventDefault();
            if (canUndo) {
                undo();
            }
            return;
        }

        // New Event: C or N
        if ((e.key === 'c' || e.key === 'n') && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            onNewEvent?.();
            return;
        }

        // Navigation: Arrow Keys (Change Year)
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            setYear(year - 1);
        }
        if (e.key === 'ArrowRight') {
            e.preventDefault();
            setYear(year + 1);
        }

    }, [undo, canUndo, onNewEvent, year, setYear]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);
};
