import { DEBUGGER_SESSIONS_STORAGE_KEY } from "@crikket/capture-core/debugger/constants"
import {
  appendActionEventWithDedup,
  appendEventWithRetentionPolicy,
  appendNetworkEventWithDedup,
} from "@crikket/capture-core/debugger/engine/background/retention"
import {
  normalizeDebuggerEvent,
  normalizeStoredSession,
} from "@crikket/capture-core/debugger/normalize"
import type {
  DebuggerCaptureScope,
  DebuggerEvent,
  DebuggerEventSource,
  DebuggerSessionSnapshot,
  StoredDebuggerSession,
} from "@crikket/capture-core/debugger/types"
import { reportNonFatalError } from "@crikket/shared/lib/errors"
import {
  createSessionId,
  injectDebuggerScriptIntoTab,
  isInjectablePageUrl,
} from "./injection"

interface StartSessionPayload {
  captureTabId: number
  captureScope?: DebuggerCaptureScope
  captureType: "video" | "screenshot"
  captureWindowId?: number
  instantReplayLookbackMs?: number
}

interface MarkRecordingStartedPayload {
  sessionId: string
  recordingStartedAt: number
}

interface TrackedTabState {
  tabId: number
  title?: string
  url?: string
  windowId: number
}

interface DebuggerSessionStore {
  startSession: (payload: StartSessionPayload) => Promise<{
    sessionId: string
    startedAt: number
  }>
  appendPageEvents: (tabId: number, rawEvents: unknown[]) => Promise<void>
  getSessionSnapshot: (
    sessionId: string
  ) => Promise<DebuggerSessionSnapshot | null>
  markSessionRecordingStarted: (
    payload: MarkRecordingStartedPayload
  ) => Promise<void>
  discardSession: (sessionId: string) => Promise<void>
  syncTabWithSessions: (tabId: number, tab?: chrome.tabs.Tab) => Promise<void>
  handleTabRemoved: (tabId: number) => Promise<void>
}

export function createDebuggerSessionStore(): DebuggerSessionStore {
  const sessionsById = new Map<string, StoredDebuggerSession>()
  const tabToSession = new Map<number, string>()
  const windowToSession = new Map<number, string>()
  const recentEventsByTab = new Map<number, DebuggerEvent[]>()
  const trackedTabsById = new Map<number, TrackedTabState>()

  let isLoaded = false
  let loadPromise: Promise<void> | null = null
  let persistTimer: ReturnType<typeof setTimeout> | null = null

  const schedulePersist = () => {
    if (persistTimer) {
      return
    }

    persistTimer = setTimeout(() => {
      persistTimer = null
      persistState().catch((error: unknown) => {
        reportNonFatalError("Failed to persist debugger state", error)
      })
    }, 250)
  }

  const persistState = async () => {
    const sessionsSnapshot = Array.from(sessionsById.values())

    await chrome.storage.local.set({
      [DEBUGGER_SESSIONS_STORAGE_KEY]: sessionsSnapshot,
    })
  }

  const registerSessionAssociations = (session: StoredDebuggerSession) => {
    if (session.captureScope === "window" && session.captureWindowId !== null) {
      windowToSession.set(session.captureWindowId, session.sessionId)
    }

    const trackedTabIds =
      session.trackedTabIds.length > 0
        ? session.trackedTabIds
        : [session.captureTabId]

    for (const tabId of trackedTabIds) {
      tabToSession.set(tabId, session.sessionId)
    }
  }

  const hydrateStoredState = async () => {
    const result = await chrome.storage.local.get([
      DEBUGGER_SESSIONS_STORAGE_KEY,
    ])
    const storedSessions = result[DEBUGGER_SESSIONS_STORAGE_KEY]

    if (!Array.isArray(storedSessions)) {
      return
    }

    for (const candidate of storedSessions) {
      const session = normalizeStoredSession(candidate)
      if (!session) {
        continue
      }

      sessionsById.set(session.sessionId, session)
      registerSessionAssociations(session)
    }
  }

  const ensureLoaded = async () => {
    if (isLoaded) {
      return
    }

    if (loadPromise) {
      await loadPromise
      return
    }

    loadPromise = hydrateStoredState()
      .catch((error: unknown) => {
        reportNonFatalError("Failed to load debugger state from storage", error)
      })
      .finally(() => {
        isLoaded = true
        loadPromise = null
      })

    await loadPromise
  }

  const setTrackedTabState = (tab: chrome.tabs.Tab): TrackedTabState | null => {
    if (typeof tab.id !== "number" || typeof tab.windowId !== "number") {
      return null
    }

    const trackedState: TrackedTabState = {
      tabId: tab.id,
      title: tab.title ?? undefined,
      url: tab.url ?? undefined,
      windowId: tab.windowId,
    }

    trackedTabsById.set(tab.id, trackedState)
    return trackedState
  }

  const resolveTrackedTabState = async (
    tabId: number,
    tab?: chrome.tabs.Tab
  ): Promise<TrackedTabState | null> => {
    if (tab) {
      return setTrackedTabState(tab)
    }

    const cached = trackedTabsById.get(tabId)
    if (cached) {
      return cached
    }

    try {
      const resolvedTab = await chrome.tabs.get(tabId)
      return setTrackedTabState(resolvedTab)
    } catch {
      return null
    }
  }

  const trackTabForSession = (
    session: StoredDebuggerSession,
    tabId: number,
    trackedTabState?: TrackedTabState | null
  ): boolean => {
    let changed = false

    if (!session.trackedTabIds.includes(tabId)) {
      session.trackedTabIds.push(tabId)
      changed = true
    }

    if (tabToSession.get(tabId) !== session.sessionId) {
      tabToSession.set(tabId, session.sessionId)
      changed = true
    }

    if (trackedTabState) {
      trackedTabsById.set(tabId, trackedTabState)
    }

    return changed
  }

  const untrackTabFromSession = (
    session: StoredDebuggerSession,
    tabId: number
  ): boolean => {
    let changed = false

    const trackedTabIndex = session.trackedTabIds.indexOf(tabId)
    if (trackedTabIndex >= 0) {
      session.trackedTabIds.splice(trackedTabIndex, 1)
      changed = true
    }

    if (tabToSession.get(tabId) === session.sessionId) {
      tabToSession.delete(tabId)
      changed = true
    }

    trackedTabsById.delete(tabId)
    recentEventsByTab.delete(tabId)

    return changed
  }

  const removeSession = (sessionId: string) => {
    const session = sessionsById.get(sessionId)
    if (!session) {
      return
    }

    sessionsById.delete(sessionId)

    if (
      session.captureScope === "window" &&
      session.captureWindowId !== null &&
      windowToSession.get(session.captureWindowId) === sessionId
    ) {
      windowToSession.delete(session.captureWindowId)
    }

    const trackedTabIds =
      session.trackedTabIds.length > 0
        ? session.trackedTabIds
        : [session.captureTabId]

    for (const tabId of trackedTabIds) {
      if (tabToSession.get(tabId) === sessionId) {
        tabToSession.delete(tabId)
      }

      trackedTabsById.delete(tabId)
      recentEventsByTab.delete(tabId)
    }
  }

  const appendEventsToSession = (
    tabId: number,
    events: DebuggerEvent[]
  ): void => {
    if (events.length === 0) {
      return
    }

    const sessionId = tabToSession.get(tabId)
    const session = sessionId ? sessionsById.get(sessionId) : undefined
    if (!session) {
      return
    }

    for (const event of events) {
      if (event.kind === "network") {
        appendNetworkEventWithDedup(session.events, event)
      } else if (event.kind === "action") {
        appendActionEventWithDedup(session.events, event)
      } else {
        appendEventWithRetentionPolicy(session.events, event)
      }
    }

    schedulePersist()
  }

  const appendEventsToRecentBuffer = (
    tabId: number,
    events: DebuggerEvent[]
  ): void => {
    if (events.length === 0) {
      return
    }

    const now = Date.now()
    const MAX_RECENT_EVENT_AGE_MS = 60_000
    const MAX_RECENT_EVENT_COUNT = 250
    const existing = recentEventsByTab.get(tabId) ?? []

    const merged = [...existing, ...events].filter((event) => {
      return now - event.timestamp <= MAX_RECENT_EVENT_AGE_MS
    })

    if (merged.length > MAX_RECENT_EVENT_COUNT) {
      recentEventsByTab.set(
        tabId,
        merged.slice(merged.length - MAX_RECENT_EVENT_COUNT)
      )
      return
    }

    recentEventsByTab.set(tabId, merged)
  }

  const consumeInstantReplayEvents = (
    tabId: number,
    lookbackMs: number
  ): DebuggerEvent[] => {
    const now = Date.now()
    const recentEvents = recentEventsByTab.get(tabId) ?? []
    if (recentEvents.length === 0) {
      return []
    }

    return recentEvents.filter((event) => {
      return now - event.timestamp <= lookbackMs
    })
  }

  const buildEventSource = async (
    tabId: number
  ): Promise<DebuggerEventSource | undefined> => {
    const trackedTabState = await resolveTrackedTabState(tabId)
    if (!trackedTabState) {
      return {
        tabId,
      }
    }

    return {
      tabId,
      title: trackedTabState.title,
      url: trackedTabState.url,
      windowId: trackedTabState.windowId,
    }
  }

  const syncTabWithSessions = async (
    tabId: number,
    tab?: chrome.tabs.Tab
  ): Promise<void> => {
    await ensureLoaded()

    const trackedTabState = await resolveTrackedTabState(tabId, tab)
    if (!trackedTabState) {
      return
    }

    let shouldPersist = false

    const activeSessionId = tabToSession.get(tabId)
    const activeSession = activeSessionId
      ? sessionsById.get(activeSessionId)
      : undefined

    if (activeSession) {
      if (
        activeSession.captureScope === "window" &&
        activeSession.captureWindowId !== null &&
        trackedTabState.windowId !== activeSession.captureWindowId
      ) {
        shouldPersist =
          untrackTabFromSession(activeSession, tabId) || shouldPersist
      } else {
        trackTabForSession(activeSession, tabId, trackedTabState)

        if (trackedTabState.url && isInjectablePageUrl(trackedTabState.url)) {
          await injectDebuggerScriptIntoTab(tabId)
        }

        if (shouldPersist) {
          schedulePersist()
        }
        return
      }
    }

    const windowSessionId = windowToSession.get(trackedTabState.windowId)
    const windowSession = windowSessionId
      ? sessionsById.get(windowSessionId)
      : undefined

    if (!windowSession || windowSession.captureScope !== "window") {
      if (shouldPersist) {
        schedulePersist()
      }
      return
    }

    shouldPersist =
      trackTabForSession(windowSession, tabId, trackedTabState) || shouldPersist

    if (trackedTabState.url && isInjectablePageUrl(trackedTabState.url)) {
      await injectDebuggerScriptIntoTab(tabId)
    }

    if (shouldPersist) {
      schedulePersist()
    }
  }

  const startSession = async (payload: StartSessionPayload) => {
    await ensureLoaded()

    const startedAt = Date.now()
    const sessionId = createSessionId()
    const captureScope: DebuggerCaptureScope =
      payload.captureScope === "window" &&
      typeof payload.captureWindowId === "number"
        ? "window"
        : "tab"
    const captureWindowId =
      captureScope === "window" &&
      Number.isFinite(payload.captureWindowId) &&
      typeof payload.captureWindowId === "number"
        ? Math.floor(payload.captureWindowId)
        : null
    const instantReplayLookbackMs =
      typeof payload.instantReplayLookbackMs === "number" &&
      Number.isFinite(payload.instantReplayLookbackMs) &&
      payload.instantReplayLookbackMs > 0
        ? Math.floor(payload.instantReplayLookbackMs)
        : 0
    const instantReplayEvents =
      instantReplayLookbackMs > 0
        ? consumeInstantReplayEvents(
            payload.captureTabId,
            instantReplayLookbackMs
          )
        : []

    const session: StoredDebuggerSession = {
      sessionId,
      captureTabId: payload.captureTabId,
      captureScope,
      captureType: payload.captureType,
      captureWindowId,
      startedAt,
      recordingStartedAt:
        payload.captureType === "screenshot" ? startedAt : null,
      trackedTabIds: [payload.captureTabId],
      events: instantReplayEvents,
    }

    sessionsById.set(sessionId, session)
    registerSessionAssociations(session)

    if (captureScope === "window" && captureWindowId !== null) {
      const windowTabs = await chrome.tabs.query({
        windowId: captureWindowId,
      })

      for (const tabInWindow of windowTabs) {
        const trackedTabState = setTrackedTabState(tabInWindow)
        if (!trackedTabState) {
          continue
        }

        if (
          trackedTabState.tabId === payload.captureTabId ||
          (trackedTabState.url && isInjectablePageUrl(trackedTabState.url))
        ) {
          trackTabForSession(session, trackedTabState.tabId, trackedTabState)
        }

        if (trackedTabState.url && isInjectablePageUrl(trackedTabState.url)) {
          await injectDebuggerScriptIntoTab(trackedTabState.tabId)
        }
      }
    } else {
      await syncTabWithSessions(payload.captureTabId)
      await injectDebuggerScriptIntoTab(payload.captureTabId)
    }

    schedulePersist()

    return {
      sessionId,
      startedAt,
    }
  }

  const appendPageEvents = async (tabId: number, rawEvents: unknown[]) => {
    await ensureLoaded()

    if (!Array.isArray(rawEvents) || rawEvents.length === 0) {
      return
    }

    if (!tabToSession.has(tabId)) {
      await syncTabWithSessions(tabId)
    }

    const source = await buildEventSource(tabId)
    const normalizedEvents: DebuggerEvent[] = []
    for (const rawEvent of rawEvents) {
      const normalizedEvent = normalizeDebuggerEvent(rawEvent)
      if (!normalizedEvent) {
        continue
      }

      normalizedEvents.push({
        ...normalizedEvent,
        source: normalizedEvent.source ?? source,
      })
    }

    appendEventsToRecentBuffer(tabId, normalizedEvents)
    appendEventsToSession(tabId, normalizedEvents)
  }

  const getSessionSnapshot = async (
    sessionId: string
  ): Promise<DebuggerSessionSnapshot | null> => {
    await ensureLoaded()

    const session = sessionsById.get(sessionId)
    if (!session) {
      return null
    }

    return {
      sessionId: session.sessionId,
      captureTabId: session.captureTabId,
      captureScope: session.captureScope,
      captureType: session.captureType,
      captureWindowId: session.captureWindowId,
      startedAt: session.startedAt,
      recordingStartedAt: session.recordingStartedAt,
      trackedTabIds: [...session.trackedTabIds],
      events: session.events,
    }
  }

  const markSessionRecordingStarted = async (
    payload: MarkRecordingStartedPayload
  ) => {
    await ensureLoaded()

    const session = sessionsById.get(payload.sessionId)
    if (!session) {
      return
    }

    session.recordingStartedAt = Math.floor(payload.recordingStartedAt)
    schedulePersist()
  }

  const discardSession = async (sessionId: string) => {
    await ensureLoaded()
    removeSession(sessionId)
    schedulePersist()
  }

  const handleTabRemoved = async (tabId: number): Promise<void> => {
    await ensureLoaded()

    const sessionId = tabToSession.get(tabId)
    if (!sessionId) {
      trackedTabsById.delete(tabId)
      recentEventsByTab.delete(tabId)
      return
    }

    const session = sessionsById.get(sessionId)
    if (!session) {
      tabToSession.delete(tabId)
      trackedTabsById.delete(tabId)
      recentEventsByTab.delete(tabId)
      return
    }

    if (session.captureScope === "tab") {
      removeSession(sessionId)
      schedulePersist()
      return
    }

    if (untrackTabFromSession(session, tabId)) {
      schedulePersist()
    }
  }

  return {
    startSession,
    appendPageEvents,
    getSessionSnapshot,
    markSessionRecordingStarted,
    discardSession,
    syncTabWithSessions,
    handleTabRemoved,
  }
}
