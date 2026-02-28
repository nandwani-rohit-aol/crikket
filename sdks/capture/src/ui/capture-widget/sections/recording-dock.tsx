import { Badge } from "../components/primitives/badge"
import { Button } from "../components/primitives/button"

export function RecordingDock(props: {
  busy: boolean
  onStopRecording: () => void
  recordingTime: string
  zIndex: number
}): React.JSX.Element {
  return (
    <div
      className="fixed right-6 bottom-[76px] z-[var(--capture-z-index)] flex items-center gap-2 rounded-full border bg-card px-3 py-2 text-card-foreground shadow-2xl"
      style={{ ["--capture-z-index" as string]: String(props.zIndex + 2) }}
    >
      <span aria-hidden="true" className="size-2 rounded-full bg-foreground" />
      <Badge variant="secondary">Recording</Badge>
      <span className="min-w-11 text-right font-mono text-muted-foreground text-xs">
        {props.recordingTime}
      </span>
      <Button
        disabled={props.busy}
        onClick={props.onStopRecording}
        size="sm"
        type="button"
      >
        Stop
      </Button>
    </div>
  )
}
