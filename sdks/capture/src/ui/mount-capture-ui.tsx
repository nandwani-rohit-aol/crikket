import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createRoot } from "react-dom/client"
import { CaptureWidgetRoot } from "./capture-widget/capture-widget-root"
import { PortalContainerProvider } from "./capture-widget/context/portal-container-context"
import { createCaptureUiStore } from "./store/capture-ui-store"
import type { CaptureUiCallbacks, MountedCaptureUi } from "./types"

const CAPTURE_WIDGET_CSS_PLACEHOLDER = "__CRIKKET_CAPTURE_WIDGET_CSS__"

export function mountCaptureUi(
  target: HTMLElement,
  zIndex: number,
  callbacks: CaptureUiCallbacks
): MountedCaptureUi {
  const hostElement = document.createElement("div")
  const shadowRoot = hostElement.attachShadow({
    mode: "open",
  })
  const styleElement = document.createElement("style")
  styleElement.textContent = CAPTURE_WIDGET_CSS_PLACEHOLDER
  const container = document.createElement("div")
  shadowRoot.append(styleElement)
  shadowRoot.append(container)
  target.append(hostElement)

  const reactRoot = createRoot(container)
  const queryClient = new QueryClient()
  const store = createCaptureUiStore()

  reactRoot.render(
    <QueryClientProvider client={queryClient}>
      <PortalContainerProvider value={shadowRoot}>
        <CaptureWidgetRoot
          callbacks={callbacks}
          store={store}
          zIndex={zIndex}
        />
      </PortalContainerProvider>
    </QueryClientProvider>
  )

  return {
    setHidden: (hidden) => {
      hostElement.style.display = hidden ? "none" : ""
    },
    store,
    unmount: () => {
      reactRoot.unmount()
      queryClient.clear()
      hostElement.remove()
      store.destroy()
    },
  }
}
