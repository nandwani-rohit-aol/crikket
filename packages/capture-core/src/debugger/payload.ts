import type {
  BugReportDebuggerPayload,
  DebuggerEventSource,
  DebuggerSessionSnapshot,
} from "./types"

export function hasDebuggerPayloadData(
  payload: BugReportDebuggerPayload
): boolean {
  return (
    payload.actions.length > 0 ||
    payload.logs.length > 0 ||
    payload.networkRequests.length > 0
  )
}

export function buildDebuggerSubmissionPayload(
  snapshot: DebuggerSessionSnapshot
): BugReportDebuggerPayload {
  const anchorTimestamp = snapshot.recordingStartedAt ?? snapshot.startedAt
  const events = [...snapshot.events].sort((a, b) => a.timestamp - b.timestamp)
  const sourceIdsByKey = new Map<string, number>()
  const sourcesById: Record<string, DebuggerEventSource> = {}
  let nextSourceId = 1

  const payload: BugReportDebuggerPayload = {
    actions: [],
    logs: [],
    networkRequests: [],
  }

  for (const event of events) {
    const timestamp = new Date(event.timestamp).toISOString()
    const offset = toOffset(event.timestamp, anchorTimestamp)
    const sourceId = registerSource(event.source)

    if (event.kind === "action") {
      payload.actions.push({
        type: event.actionType,
        target: event.target,
        timestamp,
        offset,
        metadata: event.metadata,
        sourceId,
      })
      continue
    }

    if (event.kind === "console") {
      payload.logs.push({
        level: event.level,
        message: event.message,
        timestamp,
        offset,
        metadata: event.metadata,
        sourceId,
      })
      continue
    }

    payload.networkRequests.push({
      method: event.method,
      url: event.url,
      status: event.status,
      duration: event.duration,
      requestHeaders: event.requestHeaders,
      responseHeaders: event.responseHeaders,
      requestBody: event.requestBody,
      responseBody: event.responseBody,
      timestamp,
      offset,
      sourceId,
    })
  }

  if (Object.keys(sourcesById).length > 0) {
    payload.sources = sourcesById
  }

  function registerSource(
    source: DebuggerEventSource | undefined
  ): number | undefined {
    if (!source) {
      return undefined
    }

    const normalizedSource = {
      tabId: source.tabId,
      ...(typeof source.windowId === "number"
        ? { windowId: source.windowId }
        : undefined),
      ...(source.title ? { title: source.title } : undefined),
      ...(source.url ? { url: source.url } : undefined),
    } satisfies DebuggerEventSource

    const key = JSON.stringify([
      normalizedSource.tabId,
      normalizedSource.windowId ?? null,
      normalizedSource.title ?? null,
      normalizedSource.url ?? null,
    ])
    const existingSourceId = sourceIdsByKey.get(key)
    if (existingSourceId !== undefined) {
      return existingSourceId
    }

    const sourceId = nextSourceId++
    sourceIdsByKey.set(key, sourceId)
    sourcesById[String(sourceId)] = normalizedSource
    return sourceId
  }

  return payload
}

function toOffset(
  eventTimestamp: number,
  anchorTimestamp: number
): number | null {
  const rawOffset = Math.floor(eventTimestamp - anchorTimestamp)
  return rawOffset >= 0 ? rawOffset : null
}
