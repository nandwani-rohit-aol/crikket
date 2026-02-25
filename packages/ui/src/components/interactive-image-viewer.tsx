"use client"

import { Button } from "@crikket/ui/components/ui/button"
import { Separator } from "@crikket/ui/components/ui/separator"
import { Maximize2, RotateCcw } from "lucide-react"
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useRef,
  useState,
} from "react"

interface InteractiveImageViewerProps {
  alt: string
  compact: boolean
  src: string
}

interface DragState {
  pointerId: number
  startX: number
  startY: number
  startOffsetX: number
  startOffsetY: number
}

interface PanOffset {
  x: number
  y: number
}

const MIN_IMAGE_ZOOM = 1
const MAX_IMAGE_ZOOM = 4
const IMAGE_ZOOM_STEP = 0.25
const DOUBLE_CLICK_ZOOM = 2
const KEYBOARD_PAN_STEP = 48

function clampValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function clampPanOffset(
  offset: PanOffset,
  zoom: number,
  container: HTMLElement | null
): PanOffset {
  if (!(container && zoom > MIN_IMAGE_ZOOM)) {
    return { x: 0, y: 0 }
  }

  const maxOffsetX = (container.clientWidth * (zoom - 1)) / 2
  const maxOffsetY = (container.clientHeight * (zoom - 1)) / 2

  return {
    x: clampValue(offset.x, -maxOffsetX, maxOffsetX),
    y: clampValue(offset.y, -maxOffsetY, maxOffsetY),
  }
}

export function InteractiveImageViewer({
  alt,
  compact,
  src,
}: InteractiveImageViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const viewportRef = useRef<HTMLButtonElement | null>(null)
  const dragStateRef = useRef<DragState | null>(null)
  const [zoom, setZoom] = useState(MIN_IMAGE_ZOOM)
  const [panOffset, setPanOffset] = useState<PanOffset>({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const canPan = zoom > MIN_IMAGE_ZOOM

  const updateZoom = useCallback((updater: (currentZoom: number) => number) => {
    setZoom((currentZoom) => {
      const nextZoom = clampValue(
        updater(currentZoom),
        MIN_IMAGE_ZOOM,
        MAX_IMAGE_ZOOM
      )

      setPanOffset((currentOffset) => {
        if (nextZoom <= MIN_IMAGE_ZOOM) {
          return { x: 0, y: 0 }
        }

        return clampPanOffset(currentOffset, nextZoom, viewportRef.current)
      })

      return nextZoom
    })
  }, [])

  const handleWheel = (event: ReactWheelEvent<HTMLButtonElement>) => {
    event.preventDefault()

    const zoomDelta = event.deltaY < 0 ? IMAGE_ZOOM_STEP : -IMAGE_ZOOM_STEP
    updateZoom((currentZoom) => currentZoom + zoomDelta)
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!canPan) {
      return
    }

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffsetX: panOffset.x,
      startOffsetY: panOffset.y,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setIsDragging(true)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const dragState = dragStateRef.current
    if (!(dragState && dragState.pointerId === event.pointerId)) {
      return
    }

    const deltaX = event.clientX - dragState.startX
    const deltaY = event.clientY - dragState.startY
    const nextOffset = {
      x: dragState.startOffsetX + deltaX,
      y: dragState.startOffsetY + deltaY,
    }

    setPanOffset(clampPanOffset(nextOffset, zoom, viewportRef.current))
  }

  const clearDragState = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const dragState = dragStateRef.current
    if (!(dragState && dragState.pointerId === event.pointerId)) {
      return
    }

    dragStateRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setIsDragging(false)
  }

  const nudgePanOffset = (deltaX: number, deltaY: number) => {
    setPanOffset((currentOffset) =>
      clampPanOffset(
        {
          x: currentOffset.x + deltaX,
          y: currentOffset.y + deltaY,
        },
        zoom,
        viewportRef.current
      )
    )
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "+" || event.key === "=") {
      event.preventDefault()
      updateZoom((currentZoom) => currentZoom + IMAGE_ZOOM_STEP)
      return
    }

    if (event.key === "-" || event.key === "_") {
      event.preventDefault()
      updateZoom((currentZoom) => currentZoom - IMAGE_ZOOM_STEP)
      return
    }

    if (event.key === "0") {
      event.preventDefault()
      handleReset()
      return
    }

    if (!canPan) {
      return
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault()
      nudgePanOffset(-KEYBOARD_PAN_STEP, 0)
      return
    }

    if (event.key === "ArrowRight") {
      event.preventDefault()
      nudgePanOffset(KEYBOARD_PAN_STEP, 0)
      return
    }

    if (event.key === "ArrowUp") {
      event.preventDefault()
      nudgePanOffset(0, -KEYBOARD_PAN_STEP)
      return
    }

    if (event.key === "ArrowDown") {
      event.preventDefault()
      nudgePanOffset(0, KEYBOARD_PAN_STEP)
    }
  }

  const handleReset = () => {
    setZoom(MIN_IMAGE_ZOOM)
    setPanOffset({ x: 0, y: 0 })
    setIsDragging(false)
    dragStateRef.current = null
  }

  const handleToggleFullscreen = async () => {
    const container = containerRef.current
    if (!container) {
      return
    }

    try {
      if (document.fullscreenElement === container) {
        await document.exitFullscreen()
        return
      }

      if (document.fullscreenElement) {
        await document.exitFullscreen()
      }

      await container.requestFullscreen()
    } catch {
      return
    }
  }

  return (
    <div
      className={
        compact
          ? "relative flex w-full items-center justify-center"
          : "relative flex w-full items-center justify-center"
      }
      ref={containerRef}
    >
      <div className="absolute top-2 left-2 z-20 flex items-center gap-1 rounded-md border bg-background/80 p-1 shadow-sm backdrop-blur supports-backdrop-filter:bg-background/70">
        <Button
          aria-label="Zoom out"
          disabled={zoom <= MIN_IMAGE_ZOOM}
          onClick={() => {
            updateZoom((currentZoom) => currentZoom - IMAGE_ZOOM_STEP)
          }}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <span aria-hidden="true">-</span>
        </Button>
        <Button
          aria-label="Zoom in"
          disabled={zoom >= MAX_IMAGE_ZOOM}
          onClick={() => {
            updateZoom((currentZoom) => currentZoom + IMAGE_ZOOM_STEP)
          }}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <span aria-hidden="true">+</span>
        </Button>
        <Separator className="h-4 shrink-0" orientation="vertical" />
        <Button
          aria-label="Reset zoom"
          onClick={handleReset}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
          <span className="sr-only">Reset</span>
        </Button>
        <Button
          aria-label="Toggle fullscreen"
          onClick={handleToggleFullscreen}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <Maximize2 aria-hidden="true" className="h-3.5 w-3.5" />
          <span className="sr-only">Fullscreen</span>
        </Button>
      </div>

      <button
        className={
          compact
            ? "relative w-full overflow-hidden text-left"
            : "relative flex max-h-[min(75vh,calc(100vh-9rem))] w-full max-w-full items-center justify-center overflow-hidden rounded-lg text-left"
        }
        onDoubleClick={() => {
          updateZoom((currentZoom) =>
            currentZoom > MIN_IMAGE_ZOOM ? MIN_IMAGE_ZOOM : DOUBLE_CLICK_ZOOM
          )
        }}
        onKeyDown={handleKeyDown}
        onPointerCancel={clearDragState}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={clearDragState}
        onWheel={handleWheel}
        ref={viewportRef}
        style={{
          cursor: canPan ? (isDragging ? "grabbing" : "grab") : "default",
          touchAction: canPan ? "none" : "auto",
        }}
        type="button"
      >
        <img
          alt={alt}
          className={
            compact
              ? "h-auto w-full select-none object-contain"
              : "h-auto max-h-full w-auto max-w-full select-none rounded-lg object-contain shadow-sm"
          }
          draggable={false}
          src={src}
          style={{
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
            transformOrigin: "center center",
            transition: isDragging ? "none" : "transform 120ms ease-out",
          }}
        />
      </button>

      <div className="pointer-events-none absolute right-2 bottom-2 z-20 rounded-md border bg-background/80 px-2 py-1 font-mono text-[10px] text-muted-foreground shadow-sm backdrop-blur supports-backdrop-filter:bg-background/70">
        {Math.round(zoom * 100)}%
      </div>
    </div>
  )
}
