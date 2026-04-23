import { defineUnlistedScript } from "wxt/utils/define-unlisted-script"
import { isDebuggerInstrumentationBlockedHostname } from "@/lib/bug-report-debugger/blocked-hosts"
import { setupDebuggerContentBridge } from "@/lib/bug-report-debugger/content"

export default defineUnlistedScript(() => {
  if (isDebuggerInstrumentationBlockedHostname(window.location.hostname)) {
    return
  }

  setupDebuggerContentBridge()
})
