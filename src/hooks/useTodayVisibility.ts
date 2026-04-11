import { useEffect, RefObject, useState } from 'react';
import { useIntersectionObserver } from './useIntersectionObserver';

interface TodayVisibilityOptions {
    year: number;
    startMonth: number;
    monthsToShow: number;
    highlightToday: boolean;
    eventCount: number;
}

export function useTodayVisibility(
    scrollRef: RefObject<HTMLDivElement | null>,
    setTodayInView: (inView: boolean) => void,
    { year, startMonth, monthsToShow, highlightToday, eventCount }: TodayVisibilityOptions
) {
    const [target, setTarget] = useState<Element | null>(null);

    useIntersectionObserver({
        rootRef: scrollRef,
        target,
        onChange: setTodayInView,
        rootMargin: '5px',
        threshold: 0.1
    });

    useEffect(() => {
        const scrollArea = scrollRef.current;
        if (!scrollArea) return;

        const todayEl = scrollArea.querySelector('.today-marker');
        setTarget(todayEl);

        if (!todayEl) {
            setTodayInView(false);
        }
    }, [eventCount, highlightToday, monthsToShow, scrollRef, setTodayInView, startMonth, year]);
}
