import { useEffect, RefObject, useState } from 'react';
import { useIntersectionObserver } from './useIntersectionObserver';

export function useTodayVisibility(
    scrollRef: RefObject<HTMLDivElement | null>,
    setTodayInView: (inView: boolean) => void,
    dependencies: any[]
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
    }, dependencies);
}
