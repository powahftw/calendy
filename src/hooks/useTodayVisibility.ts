import { useEffect, RefObject } from 'react';

interface TodayVisibilityOptions {
    year: number;
    startMonth: number;
    monthsToShow: number;
    highlightToday: boolean;
    /** Not read directly - it just marks when the grid may have re-rendered. */
    eventCount: number;
}

/**
 * Reports whether the today marker is on screen, so the header can offer a
 * "back to today" button only when it would do something.
 */
export const useTodayVisibility = (
    scrollRef: RefObject<HTMLDivElement | null>,
    setTodayInView: (inView: boolean) => void,
    { year, startMonth, monthsToShow, highlightToday, eventCount }: TodayVisibilityOptions
) => {
    useEffect(() => {
        const target = scrollRef.current?.querySelector('.today-marker');
        if (!target) {
            setTodayInView(false);
            return;
        }

        if (typeof IntersectionObserver === 'undefined') {
            setTodayInView(true);
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => setTodayInView(entry.isIntersecting),
            { root: scrollRef.current, rootMargin: '5px', threshold: 0.1 }
        );

        observer.observe(target);
        return () => observer.disconnect();
    }, [eventCount, highlightToday, monthsToShow, scrollRef, setTodayInView, startMonth, year]);
};
