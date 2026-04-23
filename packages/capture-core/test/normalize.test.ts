import { describe, expect, it } from "bun:test"

import {
  normalizeDebuggerEvent,
  normalizeStoredReplayBuffer,
  normalizeStoredSession,
} from "../src/debugger/normalize"

describe("debugger normalization regression", () => {
  it("sanitizes network events and strips debugger headers", () => {
    const event = normalizeDebuggerEvent({
      kind: "network",
      timestamp: 1234.9,
      method: " POST ",
      url: " https://example.com/api/report ",
      status: 201.8,
      duration: 456.9,
      requestHeaders: {
        Authorization: "Bearer token",
        "X-Debugger-Trace": "remove-me",
      },
      responseHeaders: {
        "Content-Type": "application/json",
      },
      requestBody: "x".repeat(5000),
      responseBody: "y".repeat(5000),
    })

    expect(event).toEqual({
      kind: "network",
      timestamp: 1234,
      method: "POST",
      url: "https://example.com/api/report",
      status: 201,
      duration: 456,
      requestHeaders: {
        authorization: "Bearer token",
      },
      responseHeaders: {
        "content-type": "application/json",
      },
      requestBody: "x".repeat(4000),
      responseBody: "y".repeat(4000),
      source: undefined,
    })
  })

  it("drops invalid events and sanitizes stored sessions recursively", () => {
    const session = normalizeStoredSession({
      sessionId: " session_1 ",
      captureTabId: 42.9,
      captureScope: "window",
      captureType: "video",
      captureWindowId: 9.2,
      startedAt: 1000.6,
      recordingStartedAt: 1500.4,
      trackedTabIds: [42.9, 87.4, -1, "bad"],
      events: [
        {
          kind: "action",
          timestamp: 1100.8,
          actionType: "click",
          target: "button.submit",
          source: {
            tabId: 87.9,
            windowId: 9.1,
            title: " Checkout ",
            url: " https://example.com/checkout ",
          },
          metadata: {
            nested: {
              ok: true,
              tooDeep: {
                keep: {
                  butDropThisLevel: {
                    evenDeeper: {
                      value: "nope",
                    },
                  },
                },
              },
            },
          },
        },
        {
          kind: "console",
          timestamp: 1200,
          level: "warn",
          message: " warn message ",
        },
        {
          kind: "wat",
          timestamp: 1300,
        },
      ],
    })

    expect(session).toEqual({
      sessionId: "session_1",
      captureTabId: 42,
      captureScope: "window",
      captureType: "video",
      captureWindowId: 9,
      startedAt: 1000,
      recordingStartedAt: 1500,
      trackedTabIds: [42, 87],
      events: [
        {
          kind: "action",
          timestamp: 1100,
          actionType: "click",
          target: "button.submit",
          source: {
            tabId: 87,
            windowId: 9,
            title: "Checkout",
            url: "https://example.com/checkout",
          },
          metadata: {
            nested: {
              ok: true,
              tooDeep: {
                keep: {
                  butDropThisLevel: {},
                },
              },
            },
          },
        },
        {
          kind: "console",
          timestamp: 1200,
          level: "warn",
          message: "warn message",
          metadata: undefined,
          source: undefined,
        },
      ],
    })
  })

  it("normalizes replay buffers and rejects invalid storage data", () => {
    expect(
      normalizeStoredReplayBuffer({
        tabId: 7.9,
        lastTouchedAt: 999.4,
        events: [
          {
            kind: "console",
            timestamp: 1000.3,
            level: "info",
            message: " buffered ",
          },
          {
            kind: "network",
            timestamp: "bad",
          },
        ],
      })
    ).toEqual({
      tabId: 7,
      lastTouchedAt: 999,
      events: [
        {
          kind: "console",
          timestamp: 1000,
          level: "info",
          message: "buffered",
          metadata: undefined,
          source: undefined,
        },
      ],
    })

    expect(
      normalizeStoredSession({
        sessionId: "session_2",
        captureTabId: "bad",
        captureType: "video",
        startedAt: 1,
      })
    ).toBeNull()
  })
})
