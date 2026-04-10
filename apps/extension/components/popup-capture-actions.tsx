import { Button } from "@crikket/ui/components/ui/button"
import { Checkbox } from "@crikket/ui/components/ui/checkbox"
import { cn } from "@crikket/ui/lib/utils"
import { Camera, Video } from "lucide-react"
import { ShortcutKbd } from "@/components/shortcut-kbd"
import type { PopupCaptureType } from "@/hooks/use-popup-capture"
import type { CaptureTarget } from "@/lib/capture-context"
import { formatDuration } from "@/lib/utils"

interface PopupCaptureActionsProps {
  captureTarget: CaptureTarget
  includeMicrophone: boolean
  isBusy: boolean
  isRecordingInProgress: boolean
  recordingCountdown: number | null
  recordingDurationMs: number
  pendingCaptureType: PopupCaptureType | null
  startRecordingShortcut: string | null
  startScreenshotShortcut: string | null
  stopRecordingShortcut: string | null
  onCaptureTargetChange: (value: CaptureTarget) => void
  onRequestCapture: (captureType: PopupCaptureType) => void
  onStopFromPopup: () => Promise<void>
  onStartCapture: (captureType: PopupCaptureType) => Promise<void>
  onClearPendingCapture: () => void
  onIncludeMicrophoneChange: (value: boolean) => void
}

export function PopupCaptureActions({
  captureTarget,
  includeMicrophone,
  isBusy,
  isRecordingInProgress,
  recordingCountdown,
  recordingDurationMs,
  pendingCaptureType,
  startRecordingShortcut,
  startScreenshotShortcut,
  stopRecordingShortcut,
  onCaptureTargetChange,
  onRequestCapture,
  onStopFromPopup,
  onStartCapture,
  onClearPendingCapture,
  onIncludeMicrophoneChange,
}: PopupCaptureActionsProps) {
  const isVideoSelected = pendingCaptureType !== "screenshot"
  const isScreenshotSelected = pendingCaptureType === "screenshot"

  if (recordingCountdown) {
    return (
      <div className="rounded-md border bg-primary/5 p-3 text-center">
        <p className="font-medium text-sm">Recording starts in</p>
        <p className="font-bold text-2xl">{recordingCountdown}...</p>
      </div>
    )
  }

  return (
    <>
      {isRecordingInProgress ? (
        <div className="space-y-2">
          <div className="rounded-md border bg-destructive/5 p-3 text-center">
            <p className="font-medium text-destructive text-sm">
              Recording now
            </p>
            <p className="font-mono font-semibold text-destructive text-xl">
              {formatDuration(recordingDurationMs)}
            </p>
          </div>
          <Button
            className="w-full justify-start gap-3"
            disabled={isBusy}
            onClick={() => onStopFromPopup()}
            size="lg"
            variant="destructive"
          >
            <Video className="h-5 w-5" />
            <span>Stop Recording</span>
            <ShortcutKbd
              className="bg-destructive-foreground/15 text-destructive-foreground"
              shortcut={stopRecordingShortcut}
            />
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Button
            className="w-full justify-start gap-3"
            disabled={isBusy}
            onClick={() => onRequestCapture("video")}
            size="lg"
            variant={isVideoSelected ? "default" : "outline"}
          >
            <Video className="h-5 w-5" />
            <span>Record Screen</span>
            <ShortcutKbd
              className={
                isVideoSelected
                  ? "bg-primary-foreground/15 text-primary-foreground"
                  : "bg-muted text-foreground"
              }
              shortcut={startRecordingShortcut}
            />
          </Button>

          <Button
            className="w-full justify-start gap-3"
            disabled={isBusy}
            onClick={() => onRequestCapture("screenshot")}
            size="lg"
            variant={isScreenshotSelected ? "default" : "outline"}
          >
            <Camera className="h-5 w-5" />
            <span>Take Screenshot</span>
            <ShortcutKbd
              className={
                isScreenshotSelected
                  ? "bg-primary-foreground/15 text-primary-foreground"
                  : "bg-muted text-foreground"
              }
              shortcut={startScreenshotShortcut}
            />
          </Button>
        </div>
      )}

      {pendingCaptureType ? (
        <div className="space-y-2 rounded-md border border-primary/20 bg-primary/5 p-3">
          {pendingCaptureType === "video" ? (
            <div className="space-y-2 rounded-md border border-border/60 bg-background/70 p-3">
              <span className="block font-medium text-sm">Capture target</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  className={cn(
                    "rounded-md border px-3 py-2 text-left transition-colors",
                    captureTarget === "tab"
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-background text-muted-foreground"
                  )}
                  disabled={isBusy}
                  onClick={() => onCaptureTargetChange("tab")}
                  type="button"
                >
                  <span className="block font-medium text-sm">Current tab</span>
                </button>
                <button
                  className={cn(
                    "rounded-md border px-3 py-2 text-left transition-colors",
                    captureTarget === "screen"
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-background text-muted-foreground"
                  )}
                  disabled={isBusy}
                  onClick={() => onCaptureTargetChange("screen")}
                  type="button"
                >
                  <span className="block font-medium text-sm">
                    Entire screen
                  </span>
                </button>
              </div>
            </div>
          ) : null}
          {pendingCaptureType === "video" ? (
            <label className="flex items-start gap-3 rounded-md border border-border/60 bg-background/70 p-3">
              <Checkbox
                checked={includeMicrophone}
                disabled={isBusy}
                onCheckedChange={(checked) =>
                  onIncludeMicrophoneChange(checked === true)
                }
              />
              <span className="space-y-1">
                <span className="block font-medium text-sm">
                  Include microphone
                </span>
                <span className="block text-muted-foreground text-xs">
                  Record your microphone audio along with the captured{" "}
                  {captureTarget === "screen" ? "screen" : "tab"} video.
                </span>
              </span>
            </label>
          ) : null}
          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={isBusy}
              onClick={() => onStartCapture(pendingCaptureType)}
              size="sm"
            >
              Continue
            </Button>
            <Button
              className="flex-1"
              disabled={isBusy}
              onClick={onClearPendingCapture}
              size="sm"
              variant="outline"
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </>
  )
}
