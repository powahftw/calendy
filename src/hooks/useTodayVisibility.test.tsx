import { renderHook } from '@testing-library/react';
import { RefObject } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useTodayVisibility } from './useTodayVisibility';

vi.mock('./useIntersectionObserver', () => ({
    useIntersectionObserver: vi.fn()
}));

describe('useTodayVisibility', () => {
    it('marks today as out of view when today marker is not rendered in the current range', () => {
        const setTodayInView = vi.fn();
        const scrollArea = document.createElement('div');
        const scrollRef = { current: scrollArea } as RefObject<HTMLDivElement>;

        renderHook(() => useTodayVisibility(scrollRef, setTodayInView, [2027, 0, 12]));

        expect(setTodayInView).toHaveBeenCalledWith(false);
    });
});
