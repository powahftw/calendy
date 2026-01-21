import { RefObject, useEffect } from 'react';

interface IntersectionObserverOptions {
    rootRef: RefObject<Element | null>;
    target: Element | null;
    onChange: (inView: boolean) => void;
    rootMargin?: string;
    threshold?: number | number[];
}

export const useIntersectionObserver = ({
    rootRef,
    target,
    onChange,
    rootMargin,
    threshold
}: IntersectionObserverOptions) => {
    useEffect(() => {
        if (!target) return;
        if (typeof IntersectionObserver === 'undefined') {
            onChange(true);
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                const entry = entries[0];
                if (entry) {
                    onChange(entry.isIntersecting);
                }
            },
            {
                root: rootRef.current,
                rootMargin,
                threshold
            }
        );

        observer.observe(target);
        return () => observer.disconnect();
    }, [rootRef, target, onChange, rootMargin, threshold]);
};
