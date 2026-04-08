import { describe, expect, it } from "bun:test"
import {
  parseRawHeaders,
  toHeaderRecord,
} from "../src/debugger/engine/page/headers"

describe("debugger header capture", () => {
  it("keeps explicitly allowed sensitive headers", () => {
    const headers = new Headers({
      Authorization: "Bearer token",
      "Api-Key": "api-key-value",
      Apikey: "apikey-value",
      "X-Api-Key": "x-api-key-value",
      Cookie: "session=secret",
      "X-Debugger-Trace": "drop-me",
    })

    expect(toHeaderRecord(headers)).toEqual({
      authorization: "Bearer token",
      "api-key": "api-key-value",
      apikey: "apikey-value",
      "x-api-key": "x-api-key-value",
    })
  })

  it("applies the same allowlist to raw response headers", () => {
    const rawHeaders = [
      "Authorization: Bearer token",
      "Api-Key: api-key-value",
      "Apikey: apikey-value",
      "X-Api-Key: x-api-key-value",
      "Set-Cookie: session=secret",
      "X-Debugger-Trace: drop-me",
    ].join("\n")

    expect(parseRawHeaders(rawHeaders)).toEqual({
      authorization: "Bearer token",
      "api-key": "api-key-value",
      apikey: "apikey-value",
      "x-api-key": "x-api-key-value",
    })
  })
})
