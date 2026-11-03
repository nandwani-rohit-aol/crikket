export const MAX_EVENT_COUNT = 2000
export const MAX_TEXT_LENGTH = 2000
export const MAX_URL_LENGTH = 4096
export const MAX_NETWORK_BODY_LENGTH = 4000

// Persisted debugger sessions live in chrome.storage.local (10 MB cap without
// the unlimitedStorage permission). Sessions that were never submitted or
// discarded (crash, closed recorder tab) are dropped after this age / count.
export const STORED_SESSION_MAX_AGE_MS = 6 * 60 * 60 * 1000
export const MAX_STORED_SESSION_COUNT = 5

export const PAGE_BRIDGE_SOURCE = "CRIKKET_DEBUGGER_PAGE_BRIDGE"
export const BACKGROUND_LISTENER_FLAG =
  "__crikketDebuggerBackgroundListenerRegistered"

export const DEBUGGER_SESSIONS_STORAGE_KEY = "crikketDebuggerSessions"
export const DEBUGGER_REPLAY_BUFFERS_STORAGE_KEY =
  "crikketDebuggerReplayBuffers"
export const DEBUGGER_SESSION_ID_STORAGE_KEY = "debuggerSessionId"

export const START_SESSION_MESSAGE = "CRIKKET_DEBUGGER_START_SESSION"
export const MARK_RECORDING_STARTED_MESSAGE =
  "CRIKKET_DEBUGGER_MARK_RECORDING_STARTED"
export const GET_SESSION_SNAPSHOT_MESSAGE =
  "CRIKKET_DEBUGGER_GET_SESSION_SNAPSHOT"
export const DISCARD_SESSION_MESSAGE = "CRIKKET_DEBUGGER_DISCARD_SESSION"
export const PAGE_EVENT_MESSAGE = "CRIKKET_DEBUGGER_PAGE_EVENT"
export const PAGE_EVENTS_MESSAGE = "CRIKKET_DEBUGGER_PAGE_EVENTS"
export const ENSURE_PAGE_RUNTIME_MESSAGE =
  "CRIKKET_DEBUGGER_ENSURE_PAGE_RUNTIME"
