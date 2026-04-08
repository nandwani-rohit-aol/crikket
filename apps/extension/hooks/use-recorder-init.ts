import { useEffect, useRef } from "react"

export type CaptureType = "video" | "screenshot"

interface UseRecorderInitProps {
  onCaptureTypeChange: (type: CaptureType) => void
  onIncludeMicrophoneChange: (value: boolean) => void
  onScreenshotLoaded: (blob: Blob) => void
  onStartRecording: (options?: { includeMicrophone?: boolean }) => void
  onError: (error: string) => void
}

export function useRecorderInit({
  onCaptureTypeChange,
  onIncludeMicrophoneChange,
  onScreenshotLoaded,
  onStartRecording,
  onError,
}: UseRecorderInitProps) {
  const autoStartChecked = useRef(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const type = (params.get("captureType") as CaptureType) || "video"
    const includeMicrophone =
      params.get("includeMicrophone") === "1" ||
      params.get("includeMicrophone") === "true"
    onCaptureTypeChange(type)
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
    } else if (type === "video") {
      if (autoStartChecked.current) return
      autoStartChecked.current = true

      chrome.storage.local.get(["startRecordingImmediately"], (result) => {
        if (result.startRecordingImmediately) {
          chrome.storage.local.remove(["startRecordingImmediately"])
          onStartRecording({
            includeMicrophone,
          })
        }
      })
    }
  }, [
    onCaptureTypeChange,
    onIncludeMicrophoneChange,
    onScreenshotLoaded,
    onStartRecording,
    onError,
  ])
}
