import type { CaptureUiHandlers, CaptureUiState } from "../../types"
import { Button } from "../components/primitives/button"
import { Input } from "../components/primitives/input"
import { Label } from "../components/primitives/label"

export function SuccessSection(props: {
  state: CaptureUiState
  handlers: CaptureUiHandlers
}): React.JSX.Element {
  return (
    <section className="grid gap-4 p-5">
      <div className="grid gap-1 text-center">
        <strong className="text-green-700 text-xl">Bug report submitted</strong>
        <p className="m-0 text-muted-foreground text-sm">
          Your bug report has been created successfully.
        </p>
      </div>

      <div className="grid gap-2">
        <Label>Share URL</Label>
        <Input readOnly type="text" value={props.state.shareUrl} />
      </div>

      {props.state.shareUrl ? (
        <div className="grid grid-cols-2 gap-2">
          <Button
            className="w-full"
            disabled={props.state.busy}
            onClick={props.handlers.onCopyLink}
            type="button"
            variant="outline"
          >
            {props.state.copyLabel}
          </Button>
          <Button
            className="w-full"
            disabled={props.state.busy}
            onClick={props.handlers.onOpenLink}
            type="button"
            variant="outline"
          >
            Open Link
          </Button>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <Button
          className="w-full"
          disabled={props.state.busy}
          onClick={props.handlers.onDone}
          type="button"
        >
          Done
        </Button>
        <Button
          className="w-full"
          disabled={props.state.busy}
          onClick={props.handlers.onRetry}
          type="button"
          variant="outline"
        >
          Capture Another
        </Button>
      </div>
    </section>
  )
}
