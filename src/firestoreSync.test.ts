import { beforeEach, describe, expect, it, vi } from 'vitest';

const { deleteFieldSentinel, documentRef, setDoc } = vi.hoisted(() => ({
    deleteFieldSentinel: Symbol('deleteField'),
    documentRef: Symbol('settingsDocument'),
    setDoc: vi.fn()
}));

vi.mock('./firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
    deleteField: vi.fn(() => deleteFieldSentinel),
    doc: vi.fn(() => documentRef),
    onSnapshot: vi.fn(),
    serverTimestamp: vi.fn(() => 'server timestamp'),
    setDoc
}));

vi.mock('./utils/logger', () => ({
    logger: {
        error: vi.fn(),
        info: vi.fn()
    }
}));

import { saveCalendarSelection } from './firestoreSync';

describe('saveCalendarSelection', () => {
    beforeEach(() => {
        setDoc.mockReset();
        setDoc.mockResolvedValue(undefined);
    });

    it('removes legacy Google sync settings in the calendar-selection write', async () => {
        const selection = {
            calendarId: 'calendar@example.com',
            calendarSummary: 'Travel',
            accountEmail: 'user@example.com'
        };

        await expect(saveCalendarSelection('user-id', selection)).resolves.toBe(true);
        expect(setDoc).toHaveBeenCalledWith(documentRef, {
            calendarSelection: selection,
            googleSyncSettings: deleteFieldSentinel,
            updatedAt: 'server timestamp'
        }, { merge: true });
    });
});
