import type { CalendarEvent } from './calendarEvents';
import { logger } from './logger';

/**
 * Calendar events are cached per calendar and per year in localStorage. Google
 * Calendar's read quota is generous but not unlimited, and a 30 minute TTL
 * keeps a normally-used app well inside the free tier while still picking up
 * changes within half an hour.
 *
 * Everything here degrades to an in-memory map when localStorage is
 * unavailable or full, so a private-mode browser or a quota-exceeded origin
 * still works - it just refetches more often.
 */
export const EVENT_CACHE_TTL_MS = 30 * 60_000;

const CACHE_PREFIX = 'calendy_events_v1_';
// v2 adds stable style keys and automatic colors to each cached event.
const CACHE_VERSION = 2;

export interface CachedEvents {
    events: CalendarEvent[];
    fetchedAt: number;
}

interface CacheRecord extends CachedEvents {
    version: number;
}

const memoryCache = new Map<string, CacheRecord>();

const getCacheKey = (calendarId: string, year: number) => `${CACHE_PREFIX}${calendarId}::${year}`;

const isCacheRecord = (value: unknown): value is CacheRecord => {
    if (!value || typeof value !== 'object') return false;

    const record = value as Record<string, unknown>;
    return record.version === CACHE_VERSION
        && Array.isArray(record.events)
        && typeof record.fetchedAt === 'number';
};

export const isCacheFresh = (cached: CachedEvents | null, now = Date.now()): boolean => (
    cached !== null && now - cached.fetchedAt < EVENT_CACHE_TTL_MS
);

export const readCachedEvents = (calendarId: string, year: number): CachedEvents | null => {
    const key = getCacheKey(calendarId, year);
    const fromMemory = memoryCache.get(key);
    if (fromMemory) return { events: fromMemory.events, fetchedAt: fromMemory.fetchedAt };

    if (typeof localStorage === 'undefined') return null;

    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;

        const parsed: unknown = JSON.parse(raw);
        if (!isCacheRecord(parsed)) {
            localStorage.removeItem(key);
            return null;
        }

        memoryCache.set(key, parsed);
        return { events: parsed.events, fetchedAt: parsed.fetchedAt };
    } catch (error) {
        logger.warn('Failed to read cached calendar events', error);
        return null;
    }
};

export const writeCachedEvents = (calendarId: string, year: number, events: CalendarEvent[], fetchedAt = Date.now()) => {
    const key = getCacheKey(calendarId, year);
    const record: CacheRecord = { version: CACHE_VERSION, events, fetchedAt };
    memoryCache.set(key, record);

    if (typeof localStorage === 'undefined') return;

    try {
        localStorage.setItem(key, JSON.stringify(record));
    } catch (error) {
        // Most likely a quota error on a very busy calendar. Drop every other
        // cached year and retry once; if it still fails, memory-only is fine.
        logger.warn('Calendar event cache write failed, pruning other years', error);
        clearEventCache({ exceptKey: key });

        try {
            localStorage.setItem(key, JSON.stringify(record));
        } catch {
            logger.warn('Calendar event cache is memory-only for this session');
        }
    }
};

export const clearEventCache = (options: { exceptKey?: string } = {}) => {
    for (const key of memoryCache.keys()) {
        if (key !== options.exceptKey) memoryCache.delete(key);
    }

    if (typeof localStorage === 'undefined') return;

    try {
        const staleKeys: string[] = [];
        for (let i = 0; i < localStorage.length; i += 1) {
            const key = localStorage.key(i);
            if (key?.startsWith(CACHE_PREFIX) && key !== options.exceptKey) staleKeys.push(key);
        }

        for (const key of staleKeys) localStorage.removeItem(key);
    } catch (error) {
        logger.warn('Failed to clear calendar event cache', error);
    }
};
