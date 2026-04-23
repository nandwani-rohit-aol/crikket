import { db } from "@crikket/db"
import {
  bugReportAction,
  bugReportLog,
  bugReportNetworkRequest,
} from "@crikket/db/schema/bug-report"
import { reportNonFatalError } from "@crikket/shared/lib/errors"
import { retryOnUniqueViolation } from "@crikket/shared/lib/server/retry-on-unique-violation"
import { and, asc, count, eq, ilike, or, sql } from "drizzle-orm"
import { nanoid } from "nanoid"
import { z } from "zod"

const MAX_DEBUGGER_ITEMS_PER_KIND = 2000
const MAX_OFFSET_MS = 24 * 60 * 60 * 1000

const debuggerMetadataSchema = z.record(z.string(), z.unknown()).optional()
const debuggerHeadersSchema = z.record(z.string(), z.string()).optional()
const debuggerSourceValueSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    windowId: z.number().int().nonnegative().optional(),
    title: z.string().max(4000).optional(),
    url: z.string().max(4096).optional(),
  })
const debuggerSourceSchema = debuggerSourceValueSchema.optional()
const debuggerSourceMapSchema = z
  .record(z.string(), debuggerSourceValueSchema)
  .optional()
const debuggerUnknownArraySchema = z
  .array(z.unknown())
  .max(MAX_DEBUGGER_ITEMS_PER_KIND)
  .default([])

const debuggerActionSchema = z.object({
  type: z.string().min(1).max(80),
  target: z.string().max(1000).optional(),
  timestamp: z.string().datetime({ offset: true }),
  offset: z
    .number()
    .int()
    .nonnegative()
    .max(MAX_OFFSET_MS)
    .nullable()
    .optional(),
  sourceId: z.number().int().nonnegative().optional(),
  source: debuggerSourceSchema,
  metadata: debuggerMetadataSchema,
})

const debuggerLogSchema = z.object({
  level: z.enum(["log", "info", "warn", "error", "debug"]),
  message: z.string().min(1).max(4000),
  timestamp: z.string().datetime({ offset: true }),
  offset: z
    .number()
    .int()
    .nonnegative()
    .max(MAX_OFFSET_MS)
    .nullable()
    .optional(),
  sourceId: z.number().int().nonnegative().optional(),
  source: debuggerSourceSchema,
  metadata: debuggerMetadataSchema,
})

const debuggerNetworkRequestSchema = z.object({
  method: z.string().min(1).max(20),
  url: z.string().min(1).max(4096),
  status: z.number().int().nonnegative().max(999).optional(),
  duration: z.number().int().nonnegative().max(MAX_OFFSET_MS).optional(),
  requestHeaders: debuggerHeadersSchema,
  responseHeaders: debuggerHeadersSchema,
  requestBody: z.string().max(8000).optional(),
  responseBody: z.string().max(8000).optional(),
  timestamp: z.string().datetime({ offset: true }),
  offset: z
    .number()
    .int()
    .nonnegative()
    .max(MAX_OFFSET_MS)
    .nullable()
    .optional(),
  sourceId: z.number().int().nonnegative().optional(),
  source: debuggerSourceSchema,
})

export const bugReportDebuggerInputSchema = z
  .object({
    sources: debuggerSourceMapSchema,
    actions: debuggerUnknownArraySchema,
    logs: debuggerUnknownArraySchema,
    networkRequests: debuggerUnknownArraySchema,
  })
  .optional()

export type BugReportDebuggerInput = z.infer<
  typeof bugReportDebuggerInputSchema
>

export interface DebuggerItemCounts {
  actions: number
  logs: number
  networkRequests: number
}

export interface PersistBugReportDebuggerDataResult {
  requested: DebuggerItemCounts
  persisted: DebuggerItemCounts
  dropped: DebuggerItemCounts
  warnings: string[]
}

export interface BugReportDebuggerEventsData {
  actions: Array<{
    id: string
    type: string
    target: string | null
    timestamp: string
    offset: number | null
    source: BugReportDebuggerSource | null
    metadata: Record<string, unknown> | null
  }>
  logs: Array<{
    id: string
    level: string
    message: string
    timestamp: string
    offset: number | null
    source: BugReportDebuggerSource | null
    metadata: Record<string, unknown> | null
  }>
}

export interface BugReportDebuggerSource {
  tabId: number
  windowId: number | null
  title: string | null
  url: string | null
}

export interface BugReportDebuggerSourceSummary
  extends BugReportDebuggerSource {
  actionCount: number
  logCount: number
  networkRequestCount: number
}

export interface BugReportNetworkRequestListItem {
  id: string
  method: string
  url: string
  status: number | null
  duration: number | null
  requestHeaders: Record<string, string> | null
  responseHeaders: Record<string, string> | null
  timestamp: string
  offset: number | null
  source: BugReportDebuggerSource | null
}

export interface BugReportNetworkRequestPayload {
  requestBody: string | null
  responseBody: string | null
}

export interface BugReportNetworkRequestsPageInput {
  bugReportId: string
  limit: number
  offset: number
  search?: string
  sourceTabId?: number
}

export interface BugReportNetworkRequestPayloadInput {
  bugReportId: string
  requestId: string
}

export async function clearBugReportDebuggerData(
  bugReportId: string
): Promise<void> {
  await Promise.all([
    db
      .delete(bugReportAction)
      .where(eq(bugReportAction.bugReportId, bugReportId)),
    db.delete(bugReportLog).where(eq(bugReportLog.bugReportId, bugReportId)),
    db
      .delete(bugReportNetworkRequest)
      .where(eq(bugReportNetworkRequest.bugReportId, bugReportId)),
  ])
}

export async function countBugReportNetworkRequests(input: {
  bugReportId: string
  search?: string
  sourceTabId?: number
}): Promise<number> {
  const result = await db
    .select({ value: count() })
    .from(bugReportNetworkRequest)
    .where(buildNetworkRequestsWhere(input))

  return result[0]?.value ?? 0
}

export async function getBugReportNetworkRequestsPage({
  bugReportId,
  limit,
  offset,
  search,
  sourceTabId,
}: BugReportNetworkRequestsPageInput): Promise<
  BugReportNetworkRequestListItem[]
> {
  const networkRequests = await db
    .select({
      id: bugReportNetworkRequest.id,
      method: bugReportNetworkRequest.method,
      url: bugReportNetworkRequest.url,
      status: bugReportNetworkRequest.status,
      duration: bugReportNetworkRequest.duration,
      requestHeaders: bugReportNetworkRequest.requestHeaders,
      responseHeaders: bugReportNetworkRequest.responseHeaders,
      timestamp: bugReportNetworkRequest.timestamp,
      offset: bugReportNetworkRequest.offset,
      source: bugReportNetworkRequest.source,
    })
    .from(bugReportNetworkRequest)
    .where(buildNetworkRequestsWhere({ bugReportId, search, sourceTabId }))
    .orderBy(asc(bugReportNetworkRequest.timestamp))
    .limit(limit)
    .offset(offset)

  return networkRequests.map((request): BugReportNetworkRequestListItem => {
    return {
      id: request.id,
      method: request.method,
      url: request.url,
      status: request.status,
      duration: request.duration,
      requestHeaders: asStringRecord(request.requestHeaders),
      responseHeaders: asStringRecord(request.responseHeaders),
      timestamp: request.timestamp.toISOString(),
      offset: request.offset,
      source: asDebuggerSource(request.source),
    }
  })
}

export async function getBugReportNetworkRequestPayload({
  bugReportId,
  requestId,
}: BugReportNetworkRequestPayloadInput): Promise<BugReportNetworkRequestPayload | null> {
  const [request] = await db
    .select({
      requestBody: bugReportNetworkRequest.requestBody,
      responseBody: bugReportNetworkRequest.responseBody,
    })
    .from(bugReportNetworkRequest)
    .where(
      and(
        eq(bugReportNetworkRequest.bugReportId, bugReportId),
        eq(bugReportNetworkRequest.id, requestId)
      )
    )
    .limit(1)

  if (!request) {
    return null
  }

  return {
    requestBody: request.requestBody,
    responseBody: request.responseBody,
  }
}

function buildNetworkRequestsWhere(input: {
  bugReportId: string
  search?: string
  sourceTabId?: number
}) {
  const conditions = [
    eq(bugReportNetworkRequest.bugReportId, input.bugReportId),
    typeof input.sourceTabId === "number"
      ? eq(bugReportNetworkRequest.sourceTabId, input.sourceTabId)
      : undefined,
  ].filter(Boolean)

  const bugReportCondition = and(...conditions) ?? conditions[0]

  if (!input.search) {
    return bugReportCondition
  }

  const searchPattern = `%${input.search}%`
  const searchCondition = or(
    ilike(bugReportNetworkRequest.method, searchPattern),
    ilike(bugReportNetworkRequest.url, searchPattern),
    ilike(
      sql<string>`coalesce(cast(${bugReportNetworkRequest.status} as text), '')`,
      searchPattern
    )
  )

  if (!searchCondition) {
    return bugReportCondition
  }

  return and(bugReportCondition, searchCondition) ?? bugReportCondition
}

export async function persistBugReportDebuggerData(
  bugReportId: string,
  debuggerData: BugReportDebuggerInput
): Promise<PersistBugReportDebuggerDataResult> {
  const requested = getDebuggerItemCounts(debuggerData)
  const persisted: DebuggerItemCounts = {
    actions: 0,
    logs: 0,
    networkRequests: 0,
  }
  const warnings: string[] = []

  if (!debuggerData) {
    return {
      requested,
      persisted,
      dropped: getDroppedDebuggerItemCounts(requested, persisted),
      warnings,
    }
  }

  const sourceLookup = parseDebuggerSources(debuggerData.sources, warnings)

  const actions = parseDebuggerItems(
    debuggerData.actions,
    debuggerActionSchema,
    "action events",
    warnings
  )
  const logs = parseDebuggerItems(
    debuggerData.logs,
    debuggerLogSchema,
    "log events",
    warnings
  )
  const networkRequests = parseDebuggerItems(
    debuggerData.networkRequests,
    debuggerNetworkRequestSchema,
    "network requests",
    warnings
  )

  if (actions.length > 0) {
    try {
      await retryOnUniqueViolation(async () => {
        await db.insert(bugReportAction).values(
          actions.map((action) => {
            const source = resolveDebuggerItemSource(action, sourceLookup)

            return {
              id: nanoid(16),
              bugReportId,
              type: action.type,
              target: action.target,
              timestamp: new Date(action.timestamp),
              offset: normalizeOffset(action.offset),
              sourceTabId: source?.tabId ?? null,
              source: source ?? null,
              metadata: action.metadata,
            }
          })
        )
      })
      persisted.actions = actions.length
    } catch (error) {
      warnings.push("Failed to store debugger action events.")
      reportNonFatalError(
        `Failed to persist debugger action events for bug report ${bugReportId}`,
        error
      )
    }
  }

  if (logs.length > 0) {
    try {
      await retryOnUniqueViolation(async () => {
        await db.insert(bugReportLog).values(
          logs.map((log) => {
            const source = resolveDebuggerItemSource(log, sourceLookup)

            return {
              id: nanoid(16),
              bugReportId,
              level: log.level,
              message: log.message,
              timestamp: new Date(log.timestamp),
              offset: normalizeOffset(log.offset),
              sourceTabId: source?.tabId ?? null,
              source: source ?? null,
              metadata: log.metadata,
            }
          })
        )
      })
      persisted.logs = logs.length
    } catch (error) {
      warnings.push("Failed to store debugger log events.")
      reportNonFatalError(
        `Failed to persist debugger log events for bug report ${bugReportId}`,
        error
      )
    }
  }

  if (networkRequests.length > 0) {
    try {
      await retryOnUniqueViolation(async () => {
        await db.insert(bugReportNetworkRequest).values(
          networkRequests.map((request) => {
            const source = resolveDebuggerItemSource(request, sourceLookup)

            return {
              id: nanoid(16),
              bugReportId,
              method: request.method,
              url: request.url,
              status: request.status ?? null,
              duration: request.duration ?? null,
              requestHeaders: request.requestHeaders,
              responseHeaders: request.responseHeaders,
              requestBody: request.requestBody,
              responseBody: request.responseBody,
              timestamp: new Date(request.timestamp),
              offset: normalizeOffset(request.offset),
              sourceTabId: source?.tabId ?? null,
              source: source ?? null,
            }
          })
        )
      })
      persisted.networkRequests = networkRequests.length
    } catch (error) {
      warnings.push("Failed to store debugger network requests.")
      reportNonFatalError(
        `Failed to persist debugger network requests for bug report ${bugReportId}`,
        error
      )
    }
  }

  return {
    requested,
    persisted,
    dropped: getDroppedDebuggerItemCounts(requested, persisted),
    warnings,
  }
}

export async function getBugReportDebuggerEventsData(
  bugReportId: string
): Promise<BugReportDebuggerEventsData> {
  const [actions, logs] = await Promise.all([
    db
      .select({
        id: bugReportAction.id,
        type: bugReportAction.type,
        target: bugReportAction.target,
        timestamp: bugReportAction.timestamp,
        offset: bugReportAction.offset,
        source: bugReportAction.source,
        metadata: bugReportAction.metadata,
      })
      .from(bugReportAction)
      .where(eq(bugReportAction.bugReportId, bugReportId))
      .orderBy(asc(bugReportAction.timestamp)),
    db
      .select({
        id: bugReportLog.id,
        level: bugReportLog.level,
        message: bugReportLog.message,
        timestamp: bugReportLog.timestamp,
        offset: bugReportLog.offset,
        source: bugReportLog.source,
        metadata: bugReportLog.metadata,
      })
      .from(bugReportLog)
      .where(eq(bugReportLog.bugReportId, bugReportId))
      .orderBy(asc(bugReportLog.timestamp)),
  ])

  return {
    actions: actions.map((action) => ({
      id: action.id,
      type: action.type,
      target: action.target,
      timestamp: action.timestamp.toISOString(),
      offset: action.offset,
      source: asDebuggerSource(action.source),
      metadata: asUnknownRecord(action.metadata),
    })),
    logs: logs.map((log) => ({
      id: log.id,
      level: log.level,
      message: log.message,
      timestamp: log.timestamp.toISOString(),
      offset: log.offset,
      source: asDebuggerSource(log.source),
      metadata: asUnknownRecord(log.metadata),
    })),
  }
}

export async function getBugReportDebuggerSources(
  bugReportId: string
): Promise<BugReportDebuggerSourceSummary[]> {
  const [actions, logs, networkRequests] = await Promise.all([
    db
      .select({
        sourceTabId: bugReportAction.sourceTabId,
        source: bugReportAction.source,
      })
      .from(bugReportAction)
      .where(eq(bugReportAction.bugReportId, bugReportId)),
    db
      .select({
        sourceTabId: bugReportLog.sourceTabId,
        source: bugReportLog.source,
      })
      .from(bugReportLog)
      .where(eq(bugReportLog.bugReportId, bugReportId)),
    db
      .select({
        sourceTabId: bugReportNetworkRequest.sourceTabId,
        source: bugReportNetworkRequest.source,
      })
      .from(bugReportNetworkRequest)
      .where(eq(bugReportNetworkRequest.bugReportId, bugReportId)),
  ])

  const summaries = new Map<number, BugReportDebuggerSourceSummary>()

  const ensureSummary = (
    sourceTabId: number | null,
    source: unknown
  ): BugReportDebuggerSourceSummary | null => {
    if (typeof sourceTabId !== "number") {
      return null
    }

    const normalizedSource = asDebuggerSource(source)
    const existing = summaries.get(sourceTabId)
    if (existing) {
      if (!existing.title && normalizedSource?.title) {
        existing.title = normalizedSource.title
      }
      if (!existing.url && normalizedSource?.url) {
        existing.url = normalizedSource.url
      }
      if (
        existing.windowId === null &&
        typeof normalizedSource?.windowId === "number"
      ) {
        existing.windowId = normalizedSource.windowId
      }
      return existing
    }

    const created: BugReportDebuggerSourceSummary = {
      tabId: sourceTabId,
      windowId: normalizedSource?.windowId ?? null,
      title: normalizedSource?.title ?? null,
      url: normalizedSource?.url ?? null,
      actionCount: 0,
      logCount: 0,
      networkRequestCount: 0,
    }
    summaries.set(sourceTabId, created)
    return created
  }

  for (const action of actions) {
    const summary = ensureSummary(action.sourceTabId, action.source)
    if (summary) {
      summary.actionCount += 1
    }
  }

  for (const log of logs) {
    const summary = ensureSummary(log.sourceTabId, log.source)
    if (summary) {
      summary.logCount += 1
    }
  }

  for (const request of networkRequests) {
    const summary = ensureSummary(request.sourceTabId, request.source)
    if (summary) {
      summary.networkRequestCount += 1
    }
  }

  return [...summaries.values()].sort((a, b) => {
    const countA = a.actionCount + a.logCount + a.networkRequestCount
    const countB = b.actionCount + b.logCount + b.networkRequestCount
    if (countA !== countB) {
      return countB - countA
    }
    return a.tabId - b.tabId
  })
}

function normalizeOffset(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null
  }

  return Math.max(0, Math.floor(value))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function asUnknownRecord(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) {
    return null
  }

  return value
}

function asDebuggerSource(value: unknown): BugReportDebuggerSource | null {
  if (!isRecord(value)) {
    return null
  }

  const tabId = value.tabId
  if (typeof tabId !== "number" || !Number.isFinite(tabId)) {
    return null
  }

  const windowId =
    typeof value.windowId === "number" && Number.isFinite(value.windowId)
      ? Math.floor(value.windowId)
      : null

  return {
    tabId: Math.floor(tabId),
    windowId,
    title: typeof value.title === "string" ? value.title : null,
    url: typeof value.url === "string" ? value.url : null,
  }
}

function asStringRecord(value: unknown): Record<string, string> | null {
  if (!isRecord(value)) {
    return null
  }

  const result: Record<string, string> = {}

  for (const [key, entryValue] of Object.entries(value)) {
    if (typeof entryValue !== "string") {
      continue
    }

    result[key] = entryValue
  }

  return Object.keys(result).length > 0 ? result : null
}

function parseDebuggerSources(
  input: unknown,
  warnings: string[]
): Map<number, BugReportDebuggerSource> {
  if (input === undefined) {
    return new Map()
  }

  const parsed = debuggerSourceMapSchema.safeParse(input)
  if (!parsed.success) {
    warnings.push("Skipped invalid debugger source metadata before saving.")
    return new Map()
  }

  const sources = new Map<number, BugReportDebuggerSource>()

  for (const [sourceId, source] of Object.entries(parsed.data ?? {})) {
    const normalizedSourceId = Number(sourceId)
    if (!Number.isInteger(normalizedSourceId) || normalizedSourceId < 0) {
      continue
    }

    sources.set(normalizedSourceId, {
      tabId: source.tabId,
      windowId: source.windowId ?? null,
      title: source.title ?? null,
      url: source.url ?? null,
    })
  }

  return sources
}

function resolveDebuggerItemSource(
  item: { source?: z.infer<typeof debuggerSourceValueSchema>; sourceId?: number },
  sourceLookup: Map<number, BugReportDebuggerSource>
): BugReportDebuggerSource | null {
  if (item.source) {
    return {
      tabId: item.source.tabId,
      windowId: item.source.windowId ?? null,
      title: item.source.title ?? null,
      url: item.source.url ?? null,
    }
  }

  if (typeof item.sourceId !== "number") {
    return null
  }

  return sourceLookup.get(item.sourceId) ?? null
}

function parseDebuggerItems<TParsed>(
  input: unknown[],
  schema: z.ZodType<TParsed>,
  label: string,
  warnings: string[]
): TParsed[] {
  const parsedItems: TParsed[] = []
  let droppedCount = 0

  for (const candidate of input) {
    const parsed = schema.safeParse(candidate)
    if (!parsed.success) {
      droppedCount += 1
      continue
    }

    parsedItems.push(parsed.data)
  }

  if (droppedCount > 0) {
    warnings.push(
      `Skipped ${droppedCount} invalid debugger ${label} before saving.`
    )
  }

  return parsedItems
}

function getDebuggerItemCounts(
  debuggerData: BugReportDebuggerInput
): DebuggerItemCounts {
  if (!debuggerData) {
    return {
      actions: 0,
      logs: 0,
      networkRequests: 0,
    }
  }

  return {
    actions: debuggerData.actions.length,
    logs: debuggerData.logs.length,
    networkRequests: debuggerData.networkRequests.length,
  }
}

function getDroppedDebuggerItemCounts(
  requested: DebuggerItemCounts,
  persisted: DebuggerItemCounts
): DebuggerItemCounts {
  return {
    actions: Math.max(0, requested.actions - persisted.actions),
    logs: Math.max(0, requested.logs - persisted.logs),
    networkRequests: Math.max(
      0,
      requested.networkRequests - persisted.networkRequests
    ),
  }
}
