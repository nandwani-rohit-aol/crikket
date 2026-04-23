import { installDebuggerPageRuntime } from "@crikket/capture-core/debugger/engine/page"
import { defineUnlistedScript } from "wxt/utils/define-unlisted-script"
import { isDebuggerInstrumentationBlockedHostname } from "@/lib/bug-report-debugger/blocked-hosts"

export default defineUnlistedScript(() => {
  if (isDebuggerInstrumentationBlockedHostname(window.location.hostname)) {
    return
  }

  installDebuggerPageRuntime()
})
