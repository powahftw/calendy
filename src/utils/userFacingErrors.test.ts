import { describe, expect, it } from 'vitest';
import { getUserFacingErrorMessage } from './userFacingErrors';

describe('getUserFacingErrorMessage', () => {
    it('returns the fallback for non-Error values', () => {
        expect(getUserFacingErrorMessage('boom', 'Fallback')).toBe('Fallback');
    });

    it('normalises whitespace and truncates long messages', () => {
        const longMessage = `This is a very long error message that should be collapsed and truncated because it contains
            too much detail for a toast notification shown to users in the app interface.`;
        const result = getUserFacingErrorMessage(new Error(longMessage), 'Fallback');

        expect(result).toMatch(/^This is a very long error message/);
        expect(result.endsWith('...')).toBe(true);
        expect(result.length).toBeLessThanOrEqual(140);
    });
});
