import { db } from "@crikket/db"
import { capturePublicKey } from "@crikket/db/schema/bug-report"
import { env } from "@crikket/env/server"
import { retryOnUniqueViolation } from "@crikket/shared/lib/server/retry-on-unique-violation"
import { and, eq } from "drizzle-orm"
import { nanoid } from "nanoid"

const LIVE_KEY_PREFIX = "pk_live"
const TEST_KEY_PREFIX = "pk_test"
const PUBLIC_KEY_RANDOM_LENGTH = 24
const CAPTURE_KEY_STATUS = {
  active: "active",
  revoked: "revoked",
} as const
const CAPTURE_ENVIRONMENT = {
  development: "development",
  production: "production",
} as const

type CapturePublicKeyStatus =
  (typeof CAPTURE_KEY_STATUS)[keyof typeof CAPTURE_KEY_STATUS]

export interface CapturePublicKeyRecord {
  allowedOrigins: string[]
  createdAt: Date
  createdBy: string | null
  environment: string
  id: string
  key: string
  label: string
  organizationId: string
  revokedAt: Date | null
  rotatedAt: Date | null
  status: CapturePublicKeyStatus
  updatedAt: Date
}

type EnsureCapturePublicKeyForSiteInput = {
  createdBy?: string | null
  environment?: string | null
  label?: string | null
  organizationId: string
  origin: string
}

function getCapturePublicKeyPrefix(): string {
  return env.NODE_ENV === "production" ? LIVE_KEY_PREFIX : TEST_KEY_PREFIX
}

function buildCapturePublicKey(): string {
  return `${getCapturePublicKeyPrefix()}_${nanoid(PUBLIC_KEY_RANDOM_LENGTH)}`
}

function getDefaultCaptureEnvironment(): string {
  return env.NODE_ENV === "production"
    ? CAPTURE_ENVIRONMENT.production
    : CAPTURE_ENVIRONMENT.development
}

function buildDefaultSiteLabel(origin: string): string {
  try {
    const parsedOrigin = new URL(origin)
    const hostnameLabel = parsedOrigin.hostname
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
    const portLabel = parsedOrigin.port ? `-${parsedOrigin.port}` : ""

    return `${hostnameLabel || "capture-site"}${portLabel}`.slice(0, 80)
  } catch {
    return "capture-site"
  }
}

function normalizeCaptureKeyEnvironment(value?: string | null): string {
  const normalized = value?.trim().toLowerCase()
  return normalized ? normalized.slice(0, 40) : getDefaultCaptureEnvironment()
}

function normalizeCaptureKeyLabel(
  value: string | null | undefined,
  origin: string
): string {
  const trimmed = value?.trim()
  return trimmed ? trimmed.slice(0, 80) : buildDefaultSiteLabel(origin)
}

export function normalizeCaptureOrigin(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  try {
    const parsedOrigin = new URL(trimmed)
    if (
      parsedOrigin.protocol !== "http:" &&
      parsedOrigin.protocol !== "https:"
    ) {
      return null
    }

    return `${parsedOrigin.protocol.toLowerCase()}//${parsedOrigin.host.toLowerCase()}`
  } catch {
    return null
  }
}

export function normalizeCaptureOrigins(origins: Iterable<string>): string[] {
  const normalizedOrigins = new Set<string>()

  for (const origin of origins) {
    const normalizedOrigin = normalizeCaptureOrigin(origin)
    if (normalizedOrigin) {
      normalizedOrigins.add(normalizedOrigin)
    }
  }

  return Array.from(normalizedOrigins).sort()
}

function toCapturePublicKeyRecord(
  record: typeof capturePublicKey.$inferSelect
): CapturePublicKeyRecord {
  return {
    allowedOrigins: normalizeCaptureOrigins(record.allowedOrigins),
    createdAt: record.createdAt,
    createdBy: record.createdBy,
    environment: record.environment,
    id: record.id,
    key: record.key,
    label: record.label,
    organizationId: record.organizationId,
    revokedAt: record.revokedAt,
    rotatedAt: record.rotatedAt,
    status: record.status as CapturePublicKeyStatus,
    updatedAt: record.updatedAt,
  }
}

export function isCapturePublicKeyActive(
  record: Pick<CapturePublicKeyRecord, "status">
): boolean {
  return record.status === CAPTURE_KEY_STATUS.active
}

export function isCaptureOriginAllowed(input: {
  origin: string
  record: Pick<CapturePublicKeyRecord, "allowedOrigins" | "status">
}): boolean {
  const normalizedOrigin = normalizeCaptureOrigin(input.origin)
  if (!(normalizedOrigin && isCapturePublicKeyActive(input.record))) {
    return false
  }

  return input.record.allowedOrigins.includes(normalizedOrigin)
}

async function findActiveCapturePublicKeyForOrigin(input: {
  organizationId: string
  origin: string
}): Promise<CapturePublicKeyRecord | null> {
  const records = await db.query.capturePublicKey.findMany({
    where: and(
      eq(capturePublicKey.organizationId, input.organizationId),
      eq(capturePublicKey.status, CAPTURE_KEY_STATUS.active)
    ),
    orderBy: (table, { asc }) => [asc(table.createdAt)],
  })

  const matchingRecord = records.find((record) =>
    record.allowedOrigins.includes(input.origin)
  )

  return matchingRecord ? toCapturePublicKeyRecord(matchingRecord) : null
}

export async function ensureCapturePublicKeyForSite(
  input: EnsureCapturePublicKeyForSiteInput
): Promise<CapturePublicKeyRecord> {
  const normalizedOrigin = normalizeCaptureOrigin(input.origin)
  if (!normalizedOrigin) {
    throw new Error("A valid HTTP(S) origin is required for capture keys.")
  }

  const existingRecord = await findActiveCapturePublicKeyForOrigin({
    organizationId: input.organizationId,
    origin: normalizedOrigin,
  })

  if (existingRecord) {
    return existingRecord
  }

  return retryOnUniqueViolation(async () => {
    const key = buildCapturePublicKey()
    const createdValues = {
      id: nanoid(16),
      organizationId: input.organizationId,
      key,
      label: normalizeCaptureKeyLabel(input.label, normalizedOrigin),
      environment: normalizeCaptureKeyEnvironment(input.environment),
      allowedOrigins: [normalizedOrigin],
      status: CAPTURE_KEY_STATUS.active,
      createdBy: input.createdBy ?? null,
      rotatedAt: null,
    }

    const [createdRecord] = await db
      .insert(capturePublicKey)
      .values(createdValues)
      .returning()

    if (!createdRecord) {
      throw new Error("Failed to create capture public key.")
    }

    return toCapturePublicKeyRecord(createdRecord)
  })
}

export async function resolveCapturePublicKey(
  publicKey: string
): Promise<CapturePublicKeyRecord | null> {
  const normalizedKey = publicKey.trim()
  if (!normalizedKey) {
    return null
  }

  const record = await db.query.capturePublicKey.findFirst({
    where: eq(capturePublicKey.key, normalizedKey),
  })

  return record ? toCapturePublicKeyRecord(record) : null
}

export async function revokeCapturePublicKey(input: {
  keyId: string
  organizationId: string
}): Promise<boolean> {
  const [updatedRecord] = await db
    .update(capturePublicKey)
    .set({
      status: CAPTURE_KEY_STATUS.revoked,
      revokedAt: new Date(),
    })
    .where(
      and(
        eq(capturePublicKey.id, input.keyId),
        eq(capturePublicKey.organizationId, input.organizationId)
      )
    )
    .returning({
      id: capturePublicKey.id,
    })

  return Boolean(updatedRecord)
}

export function rotateCapturePublicKey(input: {
  keyId: string
  organizationId: string
}): Promise<CapturePublicKeyRecord | null> {
  return retryOnUniqueViolation(async () => {
    const [updatedRecord] = await db
      .update(capturePublicKey)
      .set({
        key: buildCapturePublicKey(),
        revokedAt: null,
        rotatedAt: new Date(),
        status: CAPTURE_KEY_STATUS.active,
      })
      .where(
        and(
          eq(capturePublicKey.id, input.keyId),
          eq(capturePublicKey.organizationId, input.organizationId)
        )
      )
      .returning()

    return updatedRecord ? toCapturePublicKeyRecord(updatedRecord) : null
  })
}
