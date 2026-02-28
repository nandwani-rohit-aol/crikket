import {
  DEFAULT_ENDPOINT,
  DEFAULT_SUBMIT_PATH,
  DEFAULT_Z_INDEX,
  TRAILING_SLASHES_REGEX,
} from "./constants"
import type { BridgePayload } from "./types"

export function normalizePublicKey(value: string): string {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error(
      "@crikket/capture requires a non-empty publicKey in capture.init({ publicKey })"
    )
  }

  return normalized
}

export function normalizeEndpoint(value?: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return DEFAULT_ENDPOINT
  }

  return value.trim().replace(TRAILING_SLASHES_REGEX, "")
}

export function normalizeSubmitPath(value?: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return DEFAULT_SUBMIT_PATH
  }

  const normalized = value.trim()
  return normalized.startsWith("/") ? normalized : `/${normalized}`
}

export function normalizeZIndex(value?: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_Z_INDEX
  }

  return Math.max(1, Math.floor(value))
}

export function isBridgePayload(value: unknown): value is BridgePayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false
  }

  return typeof (value as BridgePayload).source === "string"
}

export function createSessionId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID()
  }

  return `sdk_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export function toUserError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return "Capture action failed. Please try again."
}

export function getPageUrl(): string {
  if (typeof location === "undefined") {
    return ""
  }

  return location.href
}

export function getPageTitle(): string {
  if (typeof document === "undefined") {
    return ""
  }

  return document.title.trim().slice(0, 300)
}

export function getDeviceInfo(): {
  browser?: string
  os?: string
  viewport?: string
} {
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return {}
  }

  return {
    browser: navigator.userAgent || undefined,
    os: navigator.platform || undefined,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
  }
}

export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
}
