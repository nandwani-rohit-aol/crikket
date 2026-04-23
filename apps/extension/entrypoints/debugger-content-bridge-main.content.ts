import { defineContentScript } from "wxt/utils/define-content-script"
import { isDebuggerInstrumentationBlockedHostname } from "@/lib/bug-report-debugger/blocked-hosts"
import { setupDebuggerContentBridge } from "@/lib/bug-report-debugger/content"

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_start",
  main() {
    if (isDebuggerInstrumentationBlockedHostname(window.location.hostname)) {
      return
    }

    setupDebuggerContentBridge()
  },
})
