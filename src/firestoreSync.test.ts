import { beforeEach, describe, expect, it, vi } from 'vitest';

const { deleteFieldSentinel, documentRef, doc, onSnapshot, setDoc } = vi.hoisted(() => ({
    deleteFieldSentinel: Symbol('deleteField'),
    documentRef: Symbol('settingsDocument'),
    doc: vi.fn(() => Symbol('document')),
    onSnapshot: vi.fn(),
    setDoc: vi.fn()
}));

vi.mock('./firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
    deleteField: vi.fn(() => deleteFieldSentinel),
    doc,
    onSnapshot,
    serverTimestamp: vi.fn(() => 'server timestamp'),
    setDoc
}));

vi.mock('./utils/logger', () => ({
    logger: {
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn()
    }
}));

import {
    getEventStylesDocumentId,
    saveCalendarSelection,
    subscribeToEventStyleOverrides,
    syncEventStyleOverrides
} from './firestoreSync';

describe('saveCalendarSelection', () => {
    beforeEach(() => {
        doc.mockReset();
        doc.mockReturnValue(documentRef);
        onSnapshot.mockReset();
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

    it('writes a calendar-scoped event-style document, including an empty removal map', async () => {
        await expect(syncEventStyleOverrides(
            'user-id',
            'travel/calendar@example.com',
            {},
            1234
        )).resolves.toBe(true);

        expect(doc).toHaveBeenCalledWith(
            {},
            'users',
            'user-id',
            'eventStyles',
            getEventStylesDocumentId('travel/calendar@example.com')
        );
        expect(setDoc).toHaveBeenCalledWith(documentRef, {
            calendarId: 'travel/calendar@example.com',
            styles: {},
            updatedAt: 1234
        });
    });

    it('uses a fixed safe document ID for arbitrary calendar IDs', () => {
        const id = getEventStylesDocumentId('travel/calendar@example.com');
        expect(id).toMatch(/^[a-f0-9]{16}$/);
        expect(getEventStylesDocumentId('travel/calendar@example.com')).toBe(id);
    });

    it('subscribes to the same calendar document and validates remote styles', () => {
        const unsubscribe = vi.fn();
        onSnapshot.mockImplementation((_ref, onNext) => {
            onNext({
                exists: () => true,
                data: () => ({
                    calendarId: 'travel-cal',
                    styles: { trip: 6 },
                    updatedAt: 9876
                })
            });
            return unsubscribe;
        });
        const callback = vi.fn();

        expect(subscribeToEventStyleOverrides('user-id', 'travel-cal', callback)).toBe(unsubscribe);
        expect(callback).toHaveBeenCalledWith({ styles: { trip: 6 }, updatedAt: 9876 });
    });
});
