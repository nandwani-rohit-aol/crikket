import { createHash } from "node:crypto"
import { isIP } from "node:net"
import { normalizeCaptureOrigin } from "@crikket/bug-reports/lib/capture-public-key"
import { env } from "@crikket/env/server"
import { ORPCError } from "@orpc/server"
import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

const MAX_CAPTURE_REQUEST_BODY_BYTES = 110 * 1024 * 1024
const CAPTURE_RATE_LIMIT_CONFIG = {
  ipMax: 12,
  keyMax: 60,
  prefix: "crikket:rate-limit:capture",
  windowSeconds: 60,
} as const
const RATE_LIMIT_ERROR_LOG_INTERVAL_MS = 60_000
const CLIENT_ID_FALLBACK = "anonymous"

type RateLimitHeaders = Record<string, string>

type AllowedCaptureRateLimitDecision = {
  allowed: true
  headers: RateLimitHeaders
}

type BlockedCaptureRateLimitDecision = {
  allowed: false
  headers: RateLimitHeaders
  message: string
  retryAfterSeconds: number
}

export type CaptureRateLimitDecision =
  | AllowedCaptureRateLimitDecision
  | BlockedCaptureRateLimitDecision

type CaptureRateLimiters = {
  ip: Ratelimit
  key: Ratelimit
}

type RateLimitResult = {
  limit: number
  remaining: number
  reset: number
  success: boolean
}

let captureRateLimiters: CaptureRateLimiters | undefined
let lastRateLimitErrorLoggedAt = 0

function getRateLimitWindow(windowSeconds: number): `${number} s` {
  return `${windowSeconds} s`
}

function hasUpstashConfig(): boolean {
  return Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN)
}

function getCaptureRateLimiters(): CaptureRateLimiters | null {
  if (!hasUpstashConfig()) {
    return null
  }

  if (captureRateLimiters) {
    return captureRateLimiters
  }

  const redis = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  })
  const captureWindow = getRateLimitWindow(
    CAPTURE_RATE_LIMIT_CONFIG.windowSeconds
  )

  captureRateLimiters = {
    ip: new Ratelimit({
      redis,
      limiter: Ratelimit.fixedWindow(
        CAPTURE_RATE_LIMIT_CONFIG.ipMax,
        captureWindow
      ),
      prefix: `${CAPTURE_RATE_LIMIT_CONFIG.prefix}:ip`,
    }),
    key: new Ratelimit({
      redis,
      limiter: Ratelimit.fixedWindow(
        CAPTURE_RATE_LIMIT_CONFIG.keyMax,
        captureWindow
      ),
      prefix: `${CAPTURE_RATE_LIMIT_CONFIG.prefix}:key`,
    }),
  }

  return captureRateLimiters
}

function normalizeIpCandidate(value: string): string | null {
  let candidate = value.trim()
  if (!candidate) {
    return null
  }

  if (candidate.startsWith("for=")) {
    candidate = candidate.slice(4)
  }

  candidate = candidate.replace(/^"+|"+$/g, "")

  if (candidate.startsWith("[")) {
    const end = candidate.indexOf("]")
    if (end > 0) {
      candidate = candidate.slice(1, end)
    }
  }

  if (candidate.startsWith("::ffff:")) {
    candidate = candidate.slice(7)
  }

  if (
    candidate.includes(".") &&
    candidate.includes(":") &&
    candidate.lastIndexOf(":") > candidate.indexOf(".")
  ) {
    candidate = candidate.slice(0, candidate.lastIndexOf(":"))
  }

  return isIP(candidate) ? candidate : null
}

function getClientIp(request: Request): string | null {
  const directHeaders = [
    "cf-connecting-ip",
    "x-real-ip",
    "fly-client-ip",
  ] as const

  for (const headerName of directHeaders) {
    const rawValue = request.headers.get(headerName)
    if (!rawValue) {
      continue
    }

    const normalizedIp = normalizeIpCandidate(rawValue)
    if (normalizedIp) {
      return normalizedIp
    }
  }

  return null
}

function getFallbackFingerprint(request: Request): string {
  const fingerprintSource = [
    request.headers.get("user-agent")?.trim() ?? "",
    request.headers.get("accept-language")?.trim() ?? "",
    request.headers.get("sec-ch-ua")?.trim() ?? "",
    request.headers.get("sec-ch-ua-platform")?.trim() ?? "",
  ].join("|")

  if (!fingerprintSource.replaceAll("|", "")) {
    return CLIENT_ID_FALLBACK
  }

  return createHash("sha256")
    .update(fingerprintSource)
    .digest("hex")
    .slice(0, 16)
}

function getIpIdentifier(request: Request): string {
  const ipAddress = getClientIp(request)
  if (ipAddress) {
    return ipAddress
  }

  return `fp:${getFallbackFingerprint(request)}`
}

function getRateLimitHeaders(result: RateLimitResult): RateLimitHeaders {
  return {
    "x-ratelimit-limit": String(result.limit),
    "x-ratelimit-remaining": String(Math.max(result.remaining, 0)),
    "x-ratelimit-reset": String(Math.ceil(result.reset / 1000)),
  }
}

function getRetryAfterSeconds(reset: number): number {
  return Math.max(1, Math.ceil((reset - Date.now()) / 1000))
}

function toBlockedRateLimitDecision(
  result: RateLimitResult
): BlockedCaptureRateLimitDecision {
  const retryAfterSeconds = getRetryAfterSeconds(result.reset)

  return {
    allowed: false,
    headers: {
      ...getRateLimitHeaders(result),
      "retry-after": String(retryAfterSeconds),
    },
    message: "Too many capture submissions. Please try again soon.",
    retryAfterSeconds,
  }
}

function logRateLimitError(error: unknown): void {
  const now = Date.now()
  if (now - lastRateLimitErrorLoggedAt < RATE_LIMIT_ERROR_LOG_INTERVAL_MS) {
    return
  }

  lastRateLimitErrorLoggedAt = now
  console.error(
    "[capture-rate-limit] Upstash limiter failed; continuing without block",
    {
      error,
    }
  )
}

async function limitWithFailOpen(
  limiter: Ratelimit,
  key: string
): Promise<RateLimitResult | null> {
  try {
    return await limiter.limit(key)
  } catch (error) {
    logRateLimitError(error)
    return null
  }
}

function getStrictestResult(results: [RateLimitResult, ...RateLimitResult[]]) {
  return results.reduce((strictest, current) => {
    const strictestRatio = strictest.remaining / strictest.limit
    const currentRatio = current.remaining / current.limit

    if (currentRatio < strictestRatio) {
      return current
    }

    if (
      currentRatio === strictestRatio &&
      current.remaining < strictest.remaining
    ) {
      return current
    }

    return strictest
  })
}

function parseHeaderNumber(value: string | null): number | null {
  if (!value) {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function assertCaptureRequestBodyLength(request: Request): void {
  const contentLength = parseHeaderNumber(request.headers.get("content-length"))
  if (contentLength === null) {
    return
  }

  if (contentLength > MAX_CAPTURE_REQUEST_BODY_BYTES) {
    throw new ORPCError("PAYLOAD_TOO_LARGE", {
      message: `Capture request body exceeds ${Math.floor(MAX_CAPTURE_REQUEST_BODY_BYTES / (1024 * 1024))} MB limit.`,
    })
  }
}

export function getCaptureRequestOrigin(request: Request): string | null {
  const headerOrigin = request.headers.get("origin")
  if (headerOrigin) {
    return normalizeCaptureOrigin(headerOrigin)
  }

  const refererHeader = request.headers.get("referer")
  if (!refererHeader) {
    return null
  }

  try {
    return normalizeCaptureOrigin(new URL(refererHeader).origin)
  } catch {
    return null
  }
}

export async function evaluateCaptureSubmitRateLimit(input: {
  keyId: string
  request: Request
}): Promise<CaptureRateLimitDecision> {
  if (input.request.method === "OPTIONS") {
    return {
      allowed: true,
      headers: {},
    }
  }

  const limiters = getCaptureRateLimiters()
  if (!limiters) {
    return {
      allowed: true,
      headers: {},
    }
  }

  const results: RateLimitResult[] = []

  const keyResult = await limitWithFailOpen(limiters.key, input.keyId)
  if (keyResult) {
    results.push(keyResult)
    if (!keyResult.success) {
      return toBlockedRateLimitDecision(keyResult)
    }
  }

  const ipResult = await limitWithFailOpen(
    limiters.ip,
    getIpIdentifier(input.request)
  )
  if (ipResult) {
    results.push(ipResult)
    if (!ipResult.success) {
      return toBlockedRateLimitDecision(ipResult)
    }
  }

  if (results.length === 0) {
    return {
      allowed: true,
      headers: {},
    }
  }

  const strictestResult = getStrictestResult(
    results as [RateLimitResult, ...RateLimitResult[]]
  )

  return {
    allowed: true,
    headers: getRateLimitHeaders(strictestResult),
  }
}

export function buildCaptureRateLimitErrorResponse(
  decision: BlockedCaptureRateLimitDecision
): Response {
  const error = new ORPCError("TOO_MANY_REQUESTS", {
    message: decision.message,
    data: {
      retryAfterSeconds: decision.retryAfterSeconds,
    },
  })

  return new Response(JSON.stringify(error.toJSON()), {
    status: error.status,
    headers: {
      "content-type": "application/json",
      ...decision.headers,
    },
  })
}
