import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import usePlannerPersistence from '../hooks/usePlannerPersistence';
import { useCalendarConnection } from '../hooks/useCalendarConnection';
import { useCalendarEvents } from '../hooks/useCalendarEvents';
import { buildDayEventMap, deduplicateCalendarEvents } from '../utils/calendarEvents';
import { useEventStyleOverrides } from '../hooks/useEventStyleOverrides';
import { getEventStylesDocumentId, getSelectedCalendarIds } from '../firestoreSync';
import {
    PlannerProvider,
    PlannerInteractionProvider,
    PlannerDetailsStateProvider,
    type OpenDayDetails,
    type PlannerContextValue
} from './PlannerContext';

export const AppProvider: React.FC<{ user: User; children: React.ReactNode }> = ({ user, children }) => {
    const {
        settings,
        updateSettings,
        setTheme,
        navigate,
        syncStatus: settingsSyncStatus
    } = usePlannerPersistence(user);
    const connection = useCalendarConnection(user);
    const selectedCalendarIds = useMemo(
        () => getSelectedCalendarIds(connection.selection),
        [connection.selection]
    );
    const eventStyleScope = useMemo(() => (
        selectedCalendarIds.length <= 1
            ? selectedCalendarIds[0] ?? null
            : `multi:${getEventStylesDocumentId(JSON.stringify(selectedCalendarIds.slice().sort()))}`
    ), [selectedCalendarIds]);
    const { events: sourceEvents, loading, refreshing, error, lastFetchedAt, refresh } = useCalendarEvents({
        calendarIds: selectedCalendarIds,
        year: settings.year,
        startMonth: settings.startMonth,
        monthsToShow: settings.monthsToShow,
        ensureAccess: connection.ensureAccess
    });
    const visibleSourceEvents = useMemo(
        () => settings.hideDuplicateEvents ? deduplicateCalendarEvents(sourceEvents) : sourceEvents,
        [settings.hideDuplicateEvents, sourceEvents]
    );
    const { events, cycleEventStyle, syncStatus: eventStylesSyncStatus } = useEventStyleOverrides(
        user.uid,
        eventStyleScope,
        visibleSourceEvents
    );
    const syncStatus = settingsSyncStatus === 'offline' || eventStylesSyncStatus === 'offline'
        ? 'offline'
        : settingsSyncStatus === 'pending' || eventStylesSyncStatus === 'pending'
            ? 'pending'
            : 'synced';
    const [openDayDetails, setOpenDayDetails] = useState<OpenDayDetails | null>(null);
    const closeTimerRef = useRef<number | null>(null);

    const cancelDayDetailsClose = useCallback(() => {
        if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
    }, []);

    const closeDayDetails = useCallback(() => {
        cancelDayDetailsClose();
        setOpenDayDetails(null);
    }, [cancelDayDetailsClose]);

    const showDayDetails = useCallback((dayKey: string, anchor: HTMLElement, pinned = false) => {
        cancelDayDetailsClose();
        setOpenDayDetails((current) => ({
            dayKey,
            anchor,
            pinned: pinned || Boolean(current?.pinned)
        }));
    }, [cancelDayDetailsClose]);

    const scheduleDayDetailsClose = useCallback(() => {
        cancelDayDetailsClose();
        closeTimerRef.current = window.setTimeout(() => {
            setOpenDayDetails((current) => current?.pinned ? current : null);
            closeTimerRef.current = null;
        }, 220);
    }, [cancelDayDetailsClose]);

    useEffect(() => () => cancelDayDetailsClose(), [cancelDayDetailsClose]);

    const eventMap = useMemo(
        () => buildDayEventMap(events, settings),
        [events, settings]
    );

    const plannerValue = useMemo<PlannerContextValue>(() => ({
        ...settings,
        updateSettings,
        setTheme,
        navigate,
        syncStatus,
        events,
        eventMap,
        cycleEventStyle,
        loading,
        refreshing,
        error,
        lastFetchedAt,
        refresh,
        connection
    }), [
        settings, updateSettings, setTheme, navigate, syncStatus,
        events, eventMap, cycleEventStyle, loading, refreshing, error, lastFetchedAt, refresh, connection
    ]);

    const interactionValue = useMemo(
        () => ({
            showDayDetails,
            scheduleDayDetailsClose,
            cancelDayDetailsClose,
            closeDayDetails
        }),
        [
            cancelDayDetailsClose,
            closeDayDetails,
            scheduleDayDetailsClose,
            showDayDetails
        ]
    );

    const detailsStateValue = useMemo(() => ({ openDayDetails }), [openDayDetails]);

    return (
        <PlannerProvider value={plannerValue}>
            <PlannerInteractionProvider value={interactionValue}>
                <PlannerDetailsStateProvider value={detailsStateValue}>
                    {children}
                </PlannerDetailsStateProvider>
            </PlannerInteractionProvider>
        </PlannerProvider>
    );
};
