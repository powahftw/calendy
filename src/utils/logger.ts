const STORAGE_KEY = 'app_debug_mode';

let debugCache: boolean | null = null;

// Helper to check status with caching
const isDebugEnabled = (): boolean => {
    if (typeof window === 'undefined') return false;

    if (debugCache === null) {
        debugCache = localStorage.getItem(STORAGE_KEY) === 'true' || (window as any).DEBUG === true;
    }
    return debugCache;
};

// Listen for storage changes from other tabs/windows
if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEY) {
            debugCache = e.newValue === 'true';
        }
    });
}

// The Logger Object
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
        // Errors usually should always be shown, but you can gate them too if desired
        console.error(`%c[ERROR] ${message}`, 'color: #f44336; font-weight: bold;', ...args);
    },
    group: (label: string) => {
        if (isDebugEnabled()) console.groupCollapsed(label);
    },
    groupEnd: () => {
        if (isDebugEnabled()) console.groupEnd();
    }
};

// Expose control functions to the Global Window object
if (typeof window !== 'undefined') {
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
