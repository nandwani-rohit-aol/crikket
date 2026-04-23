import type { BugReportDebuggerPayload } from "@crikket/capture-core/debugger/types"
import { ORPCError } from "@orpc/client"

const MAX_PAGE_TITLE_LENGTH = 300

export interface DebuggerCaptureSummary {
  actions: number
  logs: number
  networkRequests: number
}

export const EMPTY_DEBUGGER_SUMMARY: DebuggerCaptureSummary = {
  actions: 0,
  logs: 0,
  networkRequests: 0,
}

export function buildCaptureContextSubmissionData(input: {
  title?: string
  url?: string
}): {
  normalizedPageTitle: string | undefined
  normalizedUrl: string | undefined
  warnings: string[]
} {
  const warnings: string[] = []
  const normalizedUrl = normalizeOptionalUrl(input.url)
  if (input.url && !normalizedUrl) {
    warnings.push(
      "The captured page URL was invalid and was not attached to this report."
    )
  }

  const normalizedPageTitle = normalizeOptionalText(
    input.title,
    MAX_PAGE_TITLE_LENGTH
  )
  if (
    typeof input.title === "string" &&
    input.title.trim().length > MAX_PAGE_TITLE_LENGTH
  ) {
    warnings.push("The captured page title was shortened before upload.")
  }

  return {
    normalizedPageTitle,
    normalizedUrl,
    warnings,
  }
}

export function getDebuggerCaptureSummary(
  payload: BugReportDebuggerPayload
): DebuggerCaptureSummary {
  return {
    actions: payload.actions.length,
    logs: payload.logs.length,
    networkRequests: payload.networkRequests.length,
  }
}

export function getDebuggerCapturedTabCount(
  payload: BugReportDebuggerPayload
): number {
  const tabIds = new Set<number>()

  if (payload.sources) {
    for (const source of Object.values(payload.sources)) {
      if (typeof source.tabId === "number") {
        tabIds.add(source.tabId)
      }
    }
  } else {
    for (const action of payload.actions) {
      const tabId = action.source?.tabId
      if (typeof tabId === "number") {
        tabIds.add(tabId)
      }
    }

    for (const log of payload.logs) {
      const tabId = log.source?.tabId
      if (typeof tabId === "number") {
        tabIds.add(tabId)
      }
    }

    for (const request of payload.networkRequests) {
      const tabId = request.source?.tabId
      if (typeof tabId === "number") {
        tabIds.add(tabId)
      }
    }
  }

  if (tabIds.size > 0) {
    return tabIds.size
  }

  return payload.actions.length + payload.logs.length + payload.networkRequests.length > 0
    ? 1
    : 0
}

export function dedupeMessages(messages: string[]): string[] {
  return [...new Set(messages.map((entry) => entry.trim()).filter(Boolean))]
}

export function isUnauthorizedSubmissionError(error: unknown): boolean {
  return error instanceof ORPCError && error.code === "UNAUTHORIZED"
}

export function getSubmissionErrorMessage(error: unknown): string {
  if (error instanceof ORPCError) {
    const validationMessages = getValidationIssueMessages(error.data)
    if (validationMessages.length > 0) {
      return `Please fix the report input: ${validationMessages.slice(0, 3).join(" | ")}`
    }

    if (isUnauthorizedSubmissionError(error)) {
      return "Unauthorized session. Sign in again, then resubmit this report."
    }

    if (error.code === "PAYLOAD_TOO_LARGE") {
      return "This report is too large to submit in one request. Retry with a shorter recording."
    }

    return error.message || "Failed to submit bug report."
  }

  if (error instanceof Error) {
    if (
      error.message.includes("Failed to fetch") ||
      error.message.includes("Direct upload to storage failed")
    ) {
      return "Direct upload to storage failed. Check storage CORS or network access, then retry."
    }

    return error.message
  }

  return "Failed to submit bug report."
}

export function normalizeOptionalText(
  value: string | undefined,
  maxLength: number
): string | undefined {
  if (typeof value !== "string") {
    return undefined
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  return trimmed.slice(0, maxLength)
}

function normalizeOptionalUrl(value: string | undefined): string | undefined {
  const normalized = normalizeOptionalText(value, 4096)
  if (!normalized) {
    return undefined
  }

  try {
    return new URL(normalized).toString()
  } catch {
    return undefined
  }
}

function getValidationIssueMessages(errorData: unknown): string[] {
  if (!isRecord(errorData)) {
    return []
  }

  const rawIssues = errorData.issues
  if (!Array.isArray(rawIssues)) {
    return []
  }

  const messages: string[] = []

  for (const issue of rawIssues) {
    if (!isRecord(issue)) {
      continue
    }

    const message =
      typeof issue.message === "string" && issue.message.length > 0
        ? issue.message
        : "Invalid value"

    const path = formatIssuePath(issue.path)
    messages.push(path ? `${path}: ${message}` : message)
  }

  return dedupeMessages(messages)
}

function formatIssuePath(path: unknown): string | null {
  if (!Array.isArray(path) || path.length === 0) {
    return null
  }

  const segments = path
    .map((segment) => {
      if (typeof segment === "string" || typeof segment === "number") {
        return String(segment)
      }

      return null
    })
    .filter((segment): segment is string => Boolean(segment))

  return segments.length > 0 ? segments.join(".") : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
