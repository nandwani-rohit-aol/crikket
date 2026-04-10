import { useEffect, useRef } from "react"
import type { CaptureTarget } from "@/lib/capture-context"

export type CaptureType = "video" | "screenshot"

interface UseRecorderInitProps {
  onCaptureTypeChange: (type: CaptureType) => void
  onCaptureTargetChange: (target: CaptureTarget) => void
  onIncludeMicrophoneChange: (value: boolean) => void
  onScreenshotLoaded: (blob: Blob) => void
  onStartCapture: (options?: {
    captureType?: CaptureType
    captureTarget?: CaptureTarget
    includeMicrophone?: boolean
  }) => void
  onError: (error: string) => void
}

export function useRecorderInit({
  onCaptureTypeChange,
  onCaptureTargetChange,
  onIncludeMicrophoneChange,
  onScreenshotLoaded,
  onStartCapture,
  onError,
}: UseRecorderInitProps) {
  const autoStartChecked = useRef(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const type = (params.get("captureType") as CaptureType) || "video"
    const captureTarget =
      params.get("captureTarget") === "screen" ? "screen" : "tab"
    const includeMicrophone =
      params.get("includeMicrophone") === "1" ||
      params.get("includeMicrophone") === "true"
    onCaptureTypeChange(type)
    onCaptureTargetChange(captureTarget)
    onIncludeMicrophoneChange(includeMicrophone)

    if (type === "screenshot") {
      chrome.storage.local.get(["pendingScreenshot"], (result) => {
        if (result.pendingScreenshot) {
          fetch(result.pendingScreenshot as string)
            .then((res) => res.blob())
            .then((blob) => {
              onScreenshotLoaded(blob)
              chrome.storage.local.remove(["pendingScreenshot"])
            })
            .catch((err) => {
              console.error("Failed to load screenshot:", err)
              onError("Failed to load screenshot")
            })
        }
      })
    }

    if (autoStartChecked.current) return
    autoStartChecked.current = true

    chrome.storage.local.get(["startRecordingImmediately"], (result) => {
      if (result.startRecordingImmediately) {
        chrome.storage.local.remove(["startRecordingImmediately"])
        onStartCapture({
          captureType: type,
          captureTarget,
          includeMicrophone,
        })
      }
    })
  }, [
    onCaptureTypeChange,
    onCaptureTargetChange,
    onIncludeMicrophoneChange,
    onScreenshotLoaded,
    onStartCapture,
    onError,
  ])
}
