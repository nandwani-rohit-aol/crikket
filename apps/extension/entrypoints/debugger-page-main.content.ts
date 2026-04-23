import { installDebuggerPageRuntime } from "@crikket/capture-core/debugger/engine/page"
import { defineContentScript } from "wxt/utils/define-content-script"
import { isDebuggerInstrumentationBlockedHostname } from "@/lib/bug-report-debugger/blocked-hosts"

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_start",
  world: "MAIN",
  main() {
    if (isDebuggerInstrumentationBlockedHostname(window.location.hostname)) {
      return
    }

    installDebuggerPageRuntime()
  },
})
