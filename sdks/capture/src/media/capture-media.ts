import type { RecordingController } from "../types"

interface CaptureDisplayMediaStreamOptions extends DisplayMediaStreamOptions {
  monitorTypeSurfaces?: "exclude" | "include"
  preferCurrentTab?: boolean
  selfBrowserSurface?: "exclude" | "include"
  surfaceSwitching?: "exclude" | "include"
  systemAudio?: "exclude" | "include"
}

function getDisplayVideoConstraints(): MediaTrackConstraints {
  return {
    frameRate: 30,
    displaySurface: "browser",
  }
}

function createDisplayStreamOptions(
  audio: boolean
): CaptureDisplayMediaStreamOptions {
  return {
    video: getDisplayVideoConstraints(),
    audio,
    monitorTypeSurfaces: "exclude",
    preferCurrentTab: true,
    selfBrowserSurface: "include",
    surfaceSwitching: "exclude",
    systemAudio: audio ? "include" : "exclude",
  }
}

async function requestDisplayStream(audio: boolean): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("This browser does not support screen capture.")
  }

  try {
    return await navigator.mediaDevices.getDisplayMedia(
      createDisplayStreamOptions(audio)
    )
  } catch (error) {
    if (!audio) {
      throw error
    }

    return navigator.mediaDevices.getDisplayMedia(
      createDisplayStreamOptions(false)
    )
  }
}

function assertBrowserTabSurface(stream: MediaStream): void {
  const track = stream.getVideoTracks()[0]
  const displaySurface = track?.getSettings().displaySurface

  if (displaySurface === "browser") {
    return
  }

  for (const currentTrack of stream.getTracks()) {
    currentTrack.stop()
  }

  throw new Error(
    "Please choose the current browser tab. Window and full-screen capture are not supported in the web SDK."
  )
}

export async function captureScreenshot(): Promise<Blob> {
  const stream = await requestDisplayStream(false)
  assertBrowserTabSurface(stream)

  try {
    const track = stream.getVideoTracks()[0]
    if (!track) {
      throw new Error("No video track available for screenshot capture.")
    }

    const video = document.createElement("video")
    video.srcObject = stream
    video.muted = true
    video.playsInline = true

    await waitForVideoMetadata(video)
    await video.play()

    const width = video.videoWidth
    const height = video.videoHeight
    if (!(width > 0 && height > 0)) {
      throw new Error("Captured screen dimensions were invalid.")
    }

    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext("2d")
    if (!context) {
      throw new Error("Failed to initialize screenshot canvas.")
    }

    context.drawImage(video, 0, 0, width, height)
    return canvasToBlob(canvas, "image/png")
  } finally {
    for (const currentTrack of stream.getTracks()) {
      currentTrack.stop()
    }
  }
}

export async function startDisplayRecording(): Promise<RecordingController> {
  const stream = await requestDisplayStream(true)
  assertBrowserTabSurface(stream)
  const mimeType = resolveRecordingMimeType()
  const recorder =
    mimeType.length > 0
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream)

  const startedAt = Date.now()
  const chunks: Blob[] = []
  let resolveStop:
    | ((value: { blob: Blob; durationMs: number }) => void)
    | null = null
  let rejectStop: ((reason?: unknown) => void) | null = null

  const stopPromise = new Promise<{ blob: Blob; durationMs: number }>(
    (resolve, reject) => {
      resolveStop = resolve
      rejectStop = reject
    }
  )
  const handleStreamEnded = () => {
    if (recorder.state !== "inactive") {
      recorder.stop()
    }
  }

  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data)
    }
  })

  recorder.addEventListener("error", (event) => {
    rejectStop?.(new Error(`MediaRecorder error: ${event.type}`))
  })

  recorder.addEventListener("stop", () => {
    for (const currentTrack of stream.getTracks()) {
      currentTrack.removeEventListener("ended", handleStreamEnded)
      currentTrack.stop()
    }

    const endedAt = Date.now()
    const blob = new Blob(chunks, {
      type: chunks[0]?.type || "video/webm",
    })

    resolveStop?.({
      blob,
      durationMs: Math.max(0, endedAt - startedAt),
    })
  })

  for (const currentTrack of stream.getTracks()) {
    currentTrack.addEventListener("ended", handleStreamEnded, {
      once: true,
    })
  }

  recorder.start(1000)

  return {
    finished: stopPromise,
    startedAt,
    stop: () => {
      if (recorder.state !== "inactive") {
        recorder.stop()
      }

      return stopPromise
    },
    abort: () => {
      if (recorder.state !== "inactive") {
        recorder.stop()
        return
      }

      for (const currentTrack of stream.getTracks()) {
        currentTrack.stop()
      }
    },
  }
}

function resolveRecordingMimeType(): string {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("This browser does not support video recording.")
  }

  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ]

  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate
    }
  }

  return ""
}

function waitForVideoMetadata(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const onLoadedMetadata = () => {
      cleanup()
      resolve()
    }

    const onError = () => {
      cleanup()
      reject(new Error("Failed to read captured video metadata."))
    }

    const cleanup = () => {
      video.removeEventListener("loadedmetadata", onLoadedMetadata)
      video.removeEventListener("error", onError)
    }

    video.addEventListener("loadedmetadata", onLoadedMetadata, {
      once: true,
    })
    video.addEventListener("error", onError, {
      once: true,
    })
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to generate captured image."))
        return
      }

      resolve(blob)
    }, type)
  })
}
