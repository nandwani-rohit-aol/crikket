import { CAPTURE_CORE_VERSION } from "@crikket/capture-core"
import { SCREENSHOT_LOOKBACK_MS } from "../constants"
import { DebuggerCollector } from "../debugger/debugger-collector"
import {
  captureScreenshot,
  startDisplayRecording,
} from "../media/capture-media"
import { defaultSubmitTransport } from "../transport/default-submit-transport"
import type {
  CapturedMedia,
  CaptureInitOptions,
  CaptureRuntimeConfig,
  CaptureRuntimeController,
  CaptureSubmissionDraft,
  CaptureSubmitTransport,
  RecordingController,
  ReviewSnapshot,
} from "../types"
import { mountCaptureUi } from "../ui/mount-capture-ui"
import type { MountedCaptureUi } from "../ui/types"
import {
  getDeviceInfo,
  getPageTitle,
  getPageUrl,
  normalizeEndpoint,
  normalizePublicKey,
  normalizeSubmitPath,
  normalizeZIndex,
} from "../utils"

export class CaptureSdkRuntime implements CaptureRuntimeController {
  private runtimeConfig: CaptureRuntimeConfig | null = null
  private submitTransport: CaptureSubmitTransport = defaultSubmitTransport
  private mountedTarget: HTMLElement | null = null
  private mountedUi: MountedCaptureUi | null = null
  private readonly debuggerCollector = new DebuggerCollector()
  private activeRecording: RecordingController | null = null
  private currentMedia: CapturedMedia | null = null
  private currentReview: ReviewSnapshot | null = null

  init(options: CaptureInitOptions): CaptureRuntimeController {
    const config: CaptureRuntimeConfig = {
      publicKey: normalizePublicKey(options.publicKey),
      endpoint: normalizeEndpoint(options.endpoint),
      submitPath: normalizeSubmitPath(options.submitPath),
      zIndex: normalizeZIndex(options.zIndex),
    }

    this.runtimeConfig = config
    this.submitTransport = options.submitTransport ?? defaultSubmitTransport
    this.debuggerCollector.install()

    if (options.autoMount ?? true) {
      this.mount(options.mountTarget)
    }

    return this
  }

  isInitialized(): boolean {
    return this.runtimeConfig !== null
  }

  getConfig(): CaptureRuntimeConfig | null {
    return this.runtimeConfig
  }

  mount(target?: HTMLElement): void {
    const config = this.getRuntimeConfig()
    this.ensureBrowserContext()

    if (this.mountedTarget) {
      return
    }

    const mountTarget = target ?? document.body
    this.debuggerCollector.install()
    this.mountedUi = mountCaptureUi(mountTarget, config.zIndex, {
      onClose: () => {
        this.close()
      },
      onStartVideo: () => {
        return this.startRecording()
      },
      onTakeScreenshot: async () => {
        const blob = await this.takeScreenshot()
        if (!blob) {
          throw new Error("Screenshot capture failed.")
        }
      },
      onStopRecording: async () => {
        const blob = await this.stopRecording()
        if (!blob) {
          throw new Error("Recording capture failed.")
        }
      },
      onSubmit: (draft) => {
        return this.submit(draft).then(() => undefined)
      },
      onReset: () => {
        this.reset()
      },
    })
    this.mountedTarget = mountTarget
  }

  unmount(): void {
    this.abortActiveRecording()
    this.setUiHidden(false)
    this.mountedUi?.unmount()
    this.mountedUi = null
    this.debuggerCollector.dispose()
    this.mountedTarget = null
  }

  open(): void {
    this.getRuntimeConfig()
    if (!this.mountedTarget) {
      this.mount()
    }

    this.mountedUi?.store.openChooser()
  }

  close(): void {
    this.setUiHidden(false)
    this.mountedUi?.store.close()
  }

  destroy(): void {
    this.reset()
    this.unmount()
    this.runtimeConfig = null
    this.submitTransport = defaultSubmitTransport
  }

  async startRecording(): Promise<{ startedAt: number }> {
    this.getRuntimeConfig()
    this.ensureBrowserContext()
    this.abortActiveRecording()
    this.debuggerCollector.startSession("video")

    try {
      await this.hideUiForCapture()
      const controller = await startDisplayRecording()
      this.debuggerCollector.markRecordingStarted(controller.startedAt)
      this.activeRecording = controller
      controller.finished
        .then((result) => {
          if (this.activeRecording !== controller) {
            return
          }

          this.activeRecording = null
          this.finalizeCapturedMedia({
            blob: result.blob,
            captureType: "video",
            durationMs: result.durationMs,
          })
        })
        .catch(() => undefined)

      return {
        startedAt: controller.startedAt,
      }
    } catch (error) {
      this.setUiHidden(false)
      this.debuggerCollector.clearSession()
      throw error
    }
  }

  async stopRecording(): Promise<Blob | null> {
    if (!this.activeRecording) {
      return null
    }

    const recording = this.activeRecording
    this.activeRecording = null

    const result = await recording.stop()
    this.finalizeCapturedMedia({
      blob: result.blob,
      captureType: "video",
      durationMs: result.durationMs,
    })

    return result.blob
  }

  async takeScreenshot(): Promise<Blob | null> {
    this.getRuntimeConfig()
    this.ensureBrowserContext()
    this.debuggerCollector.startSession("screenshot", SCREENSHOT_LOOKBACK_MS)

    let blob: Blob
    try {
      await this.hideUiForCapture()
      blob = await captureScreenshot()
    } catch (error) {
      this.setUiHidden(false)
      this.debuggerCollector.clearSession()
      throw error
    }
    this.finalizeCapturedMedia({
      blob,
      captureType: "screenshot",
      durationMs: null,
    })

    return blob
  }

  async submit(draft: CaptureSubmissionDraft) {
    const config = this.getRuntimeConfig()
    if (!(this.currentMedia && this.currentReview)) {
      throw new Error(
        "No capture is ready to submit. Start a recording or take a screenshot first."
      )
    }

    const result = await this.submitTransport({
      config,
      report: {
        captureType: this.currentMedia.captureType,
        title: draft.title.trim(),
        description: draft.description.trim(),
        priority: draft.priority,
        pageUrl: getPageUrl(),
        pageTitle: getPageTitle(),
        durationMs: this.currentMedia.durationMs,
        deviceInfo: getDeviceInfo(),
        sdkVersion: CAPTURE_CORE_VERSION,
        debuggerPayload: this.currentReview.debuggerPayload,
        debuggerSummary: this.currentReview.debuggerSummary,
        media: this.currentMedia.blob,
      },
    })

    if (this.mountedUi) {
      this.mountedUi.store.showSuccess(result.shareUrl)
    }

    return result
  }

  reset(): void {
    this.abortActiveRecording()
    this.setUiHidden(false)
    this.clearMedia()
    this.currentReview = null
    this.debuggerCollector.clearSession()
  }

  getCoreVersion(): string {
    return CAPTURE_CORE_VERSION
  }

  private setMedia(input: {
    blob: Blob
    captureType: CapturedMedia["captureType"]
    durationMs: number | null
  }): CapturedMedia {
    this.clearMedia()

    this.currentMedia = {
      blob: input.blob,
      captureType: input.captureType,
      durationMs: input.durationMs,
      objectUrl: URL.createObjectURL(input.blob),
    }

    return this.currentMedia
  }

  private clearMedia(): void {
    if (!this.currentMedia) {
      return
    }

    URL.revokeObjectURL(this.currentMedia.objectUrl)
    this.currentMedia = null
  }

  private finalizeCapturedMedia(input: {
    blob: Blob
    captureType: CapturedMedia["captureType"]
    durationMs: number | null
  }): void {
    this.setUiHidden(false)

    const review = this.debuggerCollector.finalizeSession()
    const media = this.setMedia(input)

    this.currentReview = review
    if (!this.mountedUi) {
      return
    }

    this.mountedUi.store.showReview({
      media,
      warnings: review.warnings,
      summary: review.debuggerSummary,
    })
    this.prefillTitle()
  }

  private abortActiveRecording(): void {
    if (!this.activeRecording) {
      return
    }

    this.activeRecording.abort()
    this.activeRecording = null
  }

  private async hideUiForCapture(): Promise<void> {
    this.setUiHidden(true)
    await waitForNextPaint()
  }

  private setUiHidden(hidden: boolean): void {
    this.mountedUi?.setHidden(hidden)
  }

  private prefillTitle(): void {
    const captureTitle = document.title.trim()
    if (captureTitle.length === 0) {
      return
    }

    this.mountedUi?.store.setTitleIfEmpty(captureTitle)
  }

  private getRuntimeConfig(): CaptureRuntimeConfig {
    if (!this.runtimeConfig) {
      throw new Error(
        "Capture SDK is not initialized. Call capture.init({ publicKey }) first."
      )
    }

    return this.runtimeConfig
  }

  private ensureBrowserContext(): void {
    if (typeof window === "undefined" || typeof document === "undefined") {
      throw new Error("Capture SDK can only run in a browser environment.")
    }
  }
}

function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve()
      })
    })
  })
}
