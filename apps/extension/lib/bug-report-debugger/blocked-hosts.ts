const BLOCKED_DEBUGGER_HOSTS = new Set([
  "track.artofliving.org",
  "aolrepo.artofliving.org",
  "aoldwiki.artofliving.org",
])

export function isDebuggerInstrumentationBlockedHostname(
  hostname: string | null | undefined
): boolean {
  if (!hostname) {
    return false
  }

  return BLOCKED_DEBUGGER_HOSTS.has(hostname.trim().toLowerCase())
}

export function isDebuggerInstrumentationBlockedUrl(
  url: string | null | undefined
): boolean {
  if (!url) {
    return false
  }

  try {
    const parsedUrl = new URL(url)
    return isDebuggerInstrumentationBlockedHostname(parsedUrl.hostname)
  } catch {
    return false
  }
}
