interface TabCaptureConstraints extends MediaTrackConstraints {
  mandatory?: {
    chromeMediaSource: "tab"
    chromeMediaSourceId: string
  }
}

interface TabCaptureStreamOptions {
  includeMicrophone?: boolean
}

export interface TabCaptureStreamHandle {
  cleanup: () => void | Promise<void>
  stream: MediaStream
}

const MICROPHONE_ACCESS_ERROR_MESSAGE =
  "Microphone access is required when 'Include microphone' is enabled. Allow microphone access and try again."
const MICROPHONE_INITIALIZATION_ERROR_MESSAGE =
  "Microphone audio could not be initialized for recording. Try again and make sure Chrome still has microphone access."

const stopStreamTracks = (stream: MediaStream | null | undefined): void => {
  if (!stream) {
    return
  }

  for (const track of stream.getTracks()) {
    track.stop()
  }
}

const requestMicrophoneStream = async (): Promise<MediaStream> => {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        autoGainControl: true,
        echoCancellation: true,
        noiseSuppression: true,
      },
      video: false,
    })
  } catch (error) {
    throw new Error(MICROPHONE_ACCESS_ERROR_MESSAGE, {
      cause: error,
    })
  }
}

export const requestMicrophonePermission = async (): Promise<void> => {
  const stream = await requestMicrophoneStream()
  stopStreamTracks(stream)
}

const waitForLiveAudioTrack = async (
  track: MediaStreamTrack
): Promise<void> => {
  if (track.readyState === "live" && !track.muted) {
    return
  }

  await new Promise<void>((resolve) => {
    let resolved = false
    const finish = () => {
      if (resolved) {
        return
      }

      resolved = true
      track.removeEventListener("ended", finish)
      track.removeEventListener("mute", onMute)
      track.removeEventListener("unmute", onUnmute)
      resolve()
    }
    const onMute = () => {
      if (track.readyState === "ended") {
        finish()
      }
    }
    const onUnmute = () => {
      finish()
    }

    track.addEventListener("ended", finish, { once: true })
    track.addEventListener("mute", onMute)
    track.addEventListener("unmute", onUnmute)
    window.setTimeout(finish, 1200)
  })
}

const createMicrophoneRecordingTrack = async (
  tabStream: MediaStream
): Promise<{
  cleanup: () => Promise<void>
  track: MediaStreamTrack
}> => {
  const microphoneStream = await requestMicrophoneStream()
  const audioContext = new AudioContext()

  try {
    if (audioContext.state === "suspended") {
      await audioContext.resume()
    }

    const microphoneSourceNode =
      audioContext.createMediaStreamSource(microphoneStream)
    const destinationNode = audioContext.createMediaStreamDestination()
    const microphoneGainNode = audioContext.createGain()
    microphoneGainNode.gain.value = 1
    microphoneSourceNode.connect(microphoneGainNode)
    microphoneGainNode.connect(destinationNode)

    const tabAudioTracks = tabStream.getAudioTracks()
    const tabAudioStream =
      tabAudioTracks.length > 0 ? new MediaStream(tabAudioTracks) : null
    const tabSourceNode = tabAudioStream
      ? audioContext.createMediaStreamSource(tabAudioStream)
      : null
    const tabMonitorGainNode = tabSourceNode ? audioContext.createGain() : null
    const tabRecordingGainNode = tabSourceNode
      ? audioContext.createGain()
      : null

    if (tabSourceNode && tabMonitorGainNode && tabRecordingGainNode) {
      tabMonitorGainNode.gain.value = 1
      tabRecordingGainNode.gain.value = 0
      tabSourceNode.connect(tabMonitorGainNode)
      tabMonitorGainNode.connect(audioContext.destination)
      tabSourceNode.connect(tabRecordingGainNode)
      tabRecordingGainNode.connect(destinationNode)
    }

    const audioTrack = destinationNode.stream.getAudioTracks()[0]
    if (!audioTrack) {
      throw new Error(MICROPHONE_INITIALIZATION_ERROR_MESSAGE)
    }

    audioTrack.enabled = true
    await waitForLiveAudioTrack(audioTrack)

    return {
      track: audioTrack,
      cleanup: async () => {
        audioTrack.stop()
        microphoneSourceNode.disconnect()
        microphoneGainNode.disconnect()
        tabSourceNode?.disconnect()
        tabMonitorGainNode?.disconnect()
        tabRecordingGainNode?.disconnect()
        stopStreamTracks(microphoneStream)
        await audioContext.close().catch(() => undefined)
      },
    }
  } catch (error) {
    stopStreamTracks(microphoneStream)
    await audioContext.close().catch(() => undefined)
    throw new Error(MICROPHONE_INITIALIZATION_ERROR_MESSAGE, {
      cause: error,
    })
  }
}

export const requestTabCaptureStream = async (
  tabId: number,
  options: TabCaptureStreamOptions = {}
): Promise<TabCaptureStreamHandle> => {
  let tabStream: MediaStream | null = null
  let microphoneCleanup: (() => Promise<void>) | null = null

  try {
    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: tabId,
    })

    tabStream = await navigator.mediaDevices.getUserMedia({
      audio: options.includeMicrophone
        ? ({
            mandatory: {
              chromeMediaSource: "tab",
              chromeMediaSourceId: streamId,
            },
          } as TabCaptureConstraints)
        : false,
      video: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId,
        },
      } as TabCaptureConstraints,
    })

    if (!options.includeMicrophone) {
      return {
        stream: tabStream,
        cleanup: () => {
          stopStreamTracks(tabStream)
        },
      }
    }

    const microphone = await createMicrophoneRecordingTrack(tabStream)
    microphoneCleanup = microphone.cleanup

    const stream = new MediaStream([
      ...tabStream.getVideoTracks(),
      microphone.track,
    ])

    return {
      stream,
      cleanup: async () => {
        stopStreamTracks(stream)
        stopStreamTracks(tabStream)
        if (microphoneCleanup) {
          await microphoneCleanup()
        }
      },
    }
  } catch (error) {
    stopStreamTracks(tabStream)
    if (microphoneCleanup) {
      await microphoneCleanup().catch(() => undefined)
    }
    throw error
  }
}
