import { describe, expect, it } from "bun:test"

import {
  buildDebuggerSubmissionPayload,
  hasDebuggerPayloadData,
} from "../src/debugger/payload"
import type { DebuggerSessionSnapshot } from "../src/debugger/types"

describe("debugger payload regression", () => {
  it("sorts events and computes offsets from recording start when available", () => {
    const snapshot: DebuggerSessionSnapshot = {
      sessionId: "session_1",
      captureTabId: 12,
      captureScope: "window",
      captureType: "video",
      captureWindowId: 7,
      startedAt: 1000,
      recordingStartedAt: 1500,
      trackedTabIds: [12, 18],
      events: [
        {
          kind: "network",
          timestamp: 2100,
          method: "POST",
          url: "https://example.com/api/report",
          status: 201,
          source: {
            tabId: 18,
            title: "Checkout confirmation",
            url: "https://example.com/checkout/confirm",
            windowId: 7,
          },
        },
        {
          kind: "action",
          timestamp: 1200,
          actionType: "click",
          target: "button.submit",
          metadata: {
            source: "checkout",
          },
          source: {
            tabId: 12,
            title: "Checkout",
            url: "https://example.com/checkout",
            windowId: 7,
          },
        },
        {
          kind: "console",
          timestamp: 1800,
          level: "error",
          message: "Network failed",
          metadata: {
            attempts: 2,
          },
          source: {
            tabId: 18,
            title: "Checkout confirmation",
            url: "https://example.com/checkout/confirm",
            windowId: 7,
          },
        },
      ],
    }

    const payload = buildDebuggerSubmissionPayload(snapshot)

    expect(payload).toEqual({
      sources: {
        "1": {
          tabId: 12,
          title: "Checkout",
          url: "https://example.com/checkout",
          windowId: 7,
        },
        "2": {
          tabId: 18,
          title: "Checkout confirmation",
          url: "https://example.com/checkout/confirm",
          windowId: 7,
        },
      },
      actions: [
        {
          type: "click",
          target: "button.submit",
          timestamp: new Date(1200).toISOString(),
          offset: null,
          metadata: {
            source: "checkout",
          },
          sourceId: 1,
        },
      ],
      logs: [
        {
          level: "error",
          message: "Network failed",
          timestamp: new Date(1800).toISOString(),
          offset: 300,
          metadata: {
            attempts: 2,
          },
          sourceId: 2,
        },
      ],
      networkRequests: [
        {
          method: "POST",
          url: "https://example.com/api/report",
          status: 201,
          duration: undefined,
          requestHeaders: undefined,
          responseHeaders: undefined,
          requestBody: undefined,
          responseBody: undefined,
          timestamp: new Date(2100).toISOString(),
          offset: 600,
          sourceId: 2,
        },
      ],
    })
  })

  it("keeps distinct source ids when the same tab navigates to a new page", () => {
    const snapshot: DebuggerSessionSnapshot = {
      sessionId: "session_2",
      captureTabId: 21,
      captureScope: "window",
      captureType: "video",
      captureWindowId: 4,
      startedAt: 100,
      recordingStartedAt: 100,
      trackedTabIds: [21],
      events: [
        {
          kind: "action",
          timestamp: 110,
          actionType: "click",
          source: {
            tabId: 21,
            windowId: 4,
            title: "Checkout",
            url: "https://example.com/checkout",
          },
        },
        {
          kind: "console",
          timestamp: 120,
          level: "info",
          message: "navigated",
          source: {
            tabId: 21,
            windowId: 4,
            title: "Confirmation",
            url: "https://example.com/checkout/confirm",
          },
        },
      ],
    }

    const payload = buildDebuggerSubmissionPayload(snapshot)

    expect(payload.sources).toEqual({
      "1": {
        tabId: 21,
        windowId: 4,
        title: "Checkout",
        url: "https://example.com/checkout",
      },
      "2": {
        tabId: 21,
        windowId: 4,
        title: "Confirmation",
        url: "https://example.com/checkout/confirm",
      },
    })
    expect(payload.actions[0]?.sourceId).toBe(1)
    expect(payload.logs[0]?.sourceId).toBe(2)
  })

  it("detects whether a payload contains any debugger data", () => {
    expect(
      hasDebuggerPayloadData({
        actions: [],
        logs: [],
        networkRequests: [],
      })
    ).toBe(false)

    expect(
      hasDebuggerPayloadData({
        actions: [
          {
            type: "click",
            timestamp: new Date(1000).toISOString(),
            offset: 0,
          },
        ],
        logs: [],
        networkRequests: [],
      })
    ).toBe(true)
  })
})
