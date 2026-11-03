import { describe, expect, mock, test } from "bun:test"

// normalizeStoredSession strips unknown fields, so simulate quota by session
// count rather than payload bytes.
const MAX_SESSIONS_IN_QUOTA = 3
const KEY = "crikketDebuggerSessions"

function installChromeMock(
  initial: Record<string, unknown> = {},
  maxSessions = Number.POSITIVE_INFINITY
) {
  const data: Record<string, unknown> = { ...initial }
  const g = globalThis as unknown as { chrome: unknown }
  g.chrome = {
    storage: {
      local: {
        get: mock((keys: string[]) =>
          Promise.resolve(
            Object.fromEntries(keys.map((key) => [key, data[key]]))
          )
        ),
        set: mock((items: Record<string, unknown>) => {
          const next = { ...data, ...items }
          if (((next[KEY] as unknown[]) ?? []).length > maxSessions) {
            return Promise.reject(
              new Error("Resource::kQuotaBytes quota exceeded")
            )
          }
          Object.assign(data, items)
          return Promise.resolve()
        }),
        remove: mock((keys: string[]) => {
          for (const key of keys) {
            delete data[key]
          }
          return Promise.resolve()
        }),
      },
    },
    tabs: {
      query: mock(() => Promise.resolve([])),
      get: mock((tabId: number) => Promise.resolve({ id: tabId, windowId: 1 })),
    },
    scripting: { executeScript: mock(() => Promise.resolve([])) },
  }
  return data
}

function storedSession(id: string, startedAt: number) {
  return {
    sessionId: id,
    captureTabId: 1,
    captureScope: "tab",
    captureType: "video",
    captureWindowId: null,
    startedAt,
    recordingStartedAt: null,
    trackedTabIds: [1],
    events: [],
  }
}

describe("debugger session store storage hygiene", () => {
  test("drops stale and excess stored sessions on load, then persists", async () => {
    const now = Date.now()
    const data = installChromeMock({
      [KEY]: [
        storedSession("old", now - 24 * 60 * 60 * 1000),
        ...Array.from({ length: 7 }, (_, i) =>
          storedSession(`fresh-${i}`, now - (7 - i) * 1000)
        ),
      ],
    })

    const { createDebuggerSessionStore } = await import("./session-store")
    const store = createDebuggerSessionStore()

    expect(await store.getSessionSnapshot("old")).toBeNull()
    expect(await store.getSessionSnapshot("fresh-0")).toBeNull()
    expect(await store.getSessionSnapshot("fresh-1")).toBeNull()
    expect(await store.getSessionSnapshot("fresh-6")).not.toBeNull()

    await new Promise((resolve) => setTimeout(resolve, 400))
    expect((data[KEY] as unknown[]).length).toBe(5)
  })

  test("quota error evicts oldest sessions instead of throwing", async () => {
    const now = Date.now()
    const data = installChromeMock(
      {
        [KEY]: [
          storedSession("a", now - 3000),
          storedSession("b", now - 2000),
          storedSession("c", now - 1000),
        ],
      },
      MAX_SESSIONS_IN_QUOTA
    )

    const { createDebuggerSessionStore } = await import("./session-store")
    const store = createDebuggerSessionStore()
    const { sessionId } = await store.startSession({
      captureTabId: 1,
      captureType: "video",
    })

    await new Promise((resolve) => setTimeout(resolve, 400))

    const stored = data[KEY] as { sessionId: string }[]
    expect(stored.length).toBeLessThanOrEqual(MAX_SESSIONS_IN_QUOTA)
    expect(stored.map((session) => session.sessionId)).toContain(sessionId)
    expect(stored.map((session) => session.sessionId)).not.toContain("a")
  })
})
