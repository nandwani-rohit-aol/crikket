import { Button } from "../components/primitives/button"

export function ChooserSection(props: {
  busy: boolean
  onStartVideo: () => void
  onTakeScreenshot: () => void
}): React.JSX.Element {
  return (
    <section className="grid gap-4 p-5">
      <p className="m-0 text-muted-foreground text-sm">
        Choose how to capture the issue.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button
          className="w-full"
          disabled={props.busy}
          onClick={props.onStartVideo}
          type="button"
        >
          Record Video
        </Button>
        <Button
          className="w-full"
          disabled={props.busy}
          onClick={props.onTakeScreenshot}
          type="button"
          variant="outline"
        >
          Take Screenshot
        </Button>
      </div>
    </section>
  )
}
