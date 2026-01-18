import { useEffect, RefObject } from 'react';

export function useTodayVisibility(
    scrollRef: RefObject<HTMLDivElement | null>,
    setTodayInView: (inView: boolean) => void,
    dependencies: any[]
) {
    useEffect(() => {
        const scrollArea = scrollRef.current;
        if (!scrollArea) return;

        const checkVisibility = () => {
            const todayEl = scrollArea.querySelector('.today-marker');
            if (!todayEl) {
                setTodayInView(true);
                return;
            }

            const todayRect = todayEl.getBoundingClientRect();
            const containerRect = scrollArea.getBoundingClientRect();
            const buffer = 5;

            const visible = (
                todayRect.bottom > containerRect.top + buffer &&
                todayRect.top < containerRect.bottom - buffer &&
                todayRect.right > containerRect.left + buffer &&
                todayRect.left < containerRect.right - buffer
            );

            setTodayInView(visible);
        };

        scrollArea.addEventListener('scroll', checkVisibility, { passive: true });
        window.addEventListener('resize', checkVisibility);

        // Check multiple times as layout settles
        const timers = [100, 500, 1000, 2000].map(ms =>
            setTimeout(checkVisibility, ms)
        );

        return () => {
            scrollArea.removeEventListener('scroll', checkVisibility);
            window.removeEventListener('resize', checkVisibility);
            timers.forEach(clearTimeout);
        };
    }, dependencies);
}
