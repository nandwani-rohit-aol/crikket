import { reportNonFatalError } from "@crikket/shared/lib/errors"
import { useCallback, useRef, useState } from "react"
import { readAndClearCaptureTabId } from "@/lib/capture-context"
import { requestTabCaptureStream } from "@/lib/display-media"

export interface UseScreenCaptureReturn {
  isRecording: boolean
  recordedBlob: Blob | null
  screenshotBlob: Blob | null
  error: string | null
  startRecording: (options?: {
    includeMicrophone?: boolean
  }) => Promise<boolean>
  stopRecording: () => Promise<Blob | null>
  takeScreenshot: () => Promise<Blob | null>
  reset: () => void
  setRecordedBlob: (blob: Blob | null) => void
  setScreenshotBlob: (blob: Blob | null) => void
}

const getMediaRecorderMimeType = (
  includeMicrophone: boolean | undefined
): string | undefined => {
  const candidates = includeMicrophone
    ? ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm"]
    : ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]

  for (const candidate of candidates) {
    if (
      typeof MediaRecorder.isTypeSupported !== "function" ||
      MediaRecorder.isTypeSupported(candidate)
    ) {
      return candidate
    }
  }

  return undefined
}

export function useScreenCapture(): UseScreenCaptureReturn {
  const [isRecording, setIsRecording] = useState(false)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [screenshotBlob, setScreenshotBlob] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const streamCleanupRef = useRef<(() => void | Promise<void>) | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const cleanupActiveStream = useCallback(() => {
    const stream = streamRef.current
    const cleanup = streamCleanupRef.current

    streamRef.current = null
    streamCleanupRef.current = null

    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop()
      }
    }

    if (cleanup) {
      Promise.resolve(cleanup()).catch((error: unknown) => {
        reportNonFatalError("Failed to clean up recording media stream", error)
      })
    }
  }, [])

  const startRecording = useCallback(
    async (options?: { includeMicrophone?: boolean }): Promise<boolean> => {
      try {
        setError(null)
        setRecordedBlob(null)

        const captureTabId = await readAndClearCaptureTabId()
        if (!captureTabId) {
          throw new Error(
            "Could not lock the source tab. Please start recording from the extension popup."
          )
        }

        const captureHandle = await requestTabCaptureStream(
          captureTabId,
          options
        )
        const { stream, cleanup } = captureHandle

        streamRef.current = stream
        streamCleanupRef.current = cleanup

        const mimeType = getMediaRecorderMimeType(options?.includeMicrophone)
        const mediaRecorderOptions = mimeType
          ? {
              mimeType,
              ...(options?.includeMicrophone
                ? {
                    audioBitsPerSecond: 128_000,
                    videoBitsPerSecond: 2_500_000,
                  }
                : {}),
            }
          : undefined
        const mediaRecorder = mediaRecorderOptions
          ? new MediaRecorder(stream, mediaRecorderOptions)
          : new MediaRecorder(stream)

        mediaRecorderRef.current = mediaRecorder
        chunksRef.current = []

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunksRef.current.push(event.data)
          }
        }

        mediaRecorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: "video/webm" })
          setRecordedBlob(blob)
          setIsRecording(false)
          cleanupActiveStream()
        }
        stream.getVideoTracks()[0].onended = () => {
          if (mediaRecorderRef.current?.state === "recording") {
            mediaRecorderRef.current.stop()
          }
        }

        mediaRecorder.start(1000)
        setIsRecording(true)

        if (options?.includeMicrophone) {
          window.setTimeout(() => {
            chrome.tabs
              .update(captureTabId, { active: true })
              .catch((error: unknown) => {
                reportNonFatalError(
                  `Failed to refocus captured tab ${captureTabId} after microphone recording start`,
                  error
                )
              })
          }, 1200)
        }

        return true
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to start recording"
        setError(message)
        setIsRecording(false)
        cleanupActiveStream()
        return false
      }
    },
    [cleanupActiveStream]
  )

  const stopRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (
        !mediaRecorderRef.current ||
        mediaRecorderRef.current.state !== "recording"
      ) {
        resolve(null)
        return
      }

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" })
        setRecordedBlob(blob)
        setIsRecording(false)
        cleanupActiveStream()

        resolve(blob)
      }

      mediaRecorderRef.current.stop()
    })
  }, [cleanupActiveStream])

  const takeScreenshot = useCallback(async (): Promise<Blob | null> => {
    try {
      setError(null)
      setScreenshotBlob(null)

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "browser",
        },
        audio: false,
      })

      const videoTrack = stream.getVideoTracks()[0]
      const settings = videoTrack.getSettings()

      const video = document.createElement("video")
      video.srcObject = stream
      video.autoplay = true

      await new Promise<void>((resolve) => {
        video.onloadedmetadata = () => {
          video.play()
          resolve()
        }
      })

      await new Promise((resolve) => setTimeout(resolve, 100))

      const canvas = document.createElement("canvas")
      canvas.width = settings.width || video.videoWidth
      canvas.height = settings.height || video.videoHeight

      const ctx = canvas.getContext("2d")
      if (!ctx) {
        throw new Error("Could not get canvas context")
      }

      ctx.drawImage(video, 0, 0)

      for (const track of stream.getTracks()) {
        track.stop()
      }
      return new Promise((resolve) => {
        canvas.toBlob((blob) => {
          setScreenshotBlob(blob)
          resolve(blob)
        }, "image/png")
      })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to take screenshot"
      setError(message)
      return null
    }
  }, [])

  const reset = useCallback(() => {
    setRecordedBlob(null)
    setScreenshotBlob(null)
    setError(null)
    setIsRecording(false)

    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop()
    }
    cleanupActiveStream()
  }, [cleanupActiveStream])

  return {
    isRecording,
    recordedBlob,
    screenshotBlob,
    error,
    startRecording,
    stopRecording,
    takeScreenshot,
    reset,
    setRecordedBlob,
    setScreenshotBlob,
  }
}
