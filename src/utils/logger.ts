const STORAGE_KEY = 'app_debug_mode';
const DEBUG_ENABLED_IN_THIS_BUILD = import.meta.env.DEV;

let debugCache: boolean | null = null;

const isDebugEnabled = (): boolean => {
    if (!DEBUG_ENABLED_IN_THIS_BUILD || typeof window === 'undefined') return false;

    if (debugCache === null) {
        debugCache = localStorage.getItem(STORAGE_KEY) === 'true' || (window as any).DEBUG === true;
    }
    return debugCache;
};

// Listen for storage changes from other tabs/windows
if (DEBUG_ENABLED_IN_THIS_BUILD && typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEY) {
            debugCache = e.newValue === 'true';
        }
    });
}

export const logger = {
    info: (message: string, ...args: any[]) => {
        if (isDebugEnabled()) {
            console.info(`%c[INFO] ${message}`, 'color: #00bcd4; font-weight: bold;', ...args);
        }
    },
    warn: (message: string, ...args: any[]) => {
        if (isDebugEnabled()) {
            console.warn(`%c[WARN] ${message}`, 'color: #ff9800; font-weight: bold;', ...args);
        }
    },
    error: (message: string, ...args: any[]) => {
        console.error(`%c[ERROR] ${message}`, 'color: #f44336; font-weight: bold;', ...args);
    },
    group: (label: string) => {
        if (isDebugEnabled()) console.groupCollapsed(label);
    },
    groupEnd: () => {
        if (isDebugEnabled()) console.groupEnd();
    }
};

if (DEBUG_ENABLED_IN_THIS_BUILD && typeof window !== 'undefined') {
    (window as any).enableDebug = () => {
        localStorage.setItem(STORAGE_KEY, 'true');
        debugCache = true;
        console.log('%c Debug Mode ENABLED. Reload to see boot logs.', 'background: green; color: white; padding: 2px 5px; border-radius: 3px;');
    };
    (window as any).disableDebug = () => {
        localStorage.removeItem(STORAGE_KEY);
        debugCache = false;
        console.log('%c Debug Mode DISABLED.', 'background: red; color: white; padding: 2px 5px; border-radius: 3px;');
    };
}
