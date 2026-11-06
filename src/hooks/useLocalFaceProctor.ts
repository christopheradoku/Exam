import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefCallback,
} from "react"

type WorkerResponse = { type: "ready" } | {
  type: "result"
  faceCount: number
} | { type: "error"; message: string }

export type ProctorOptions = {
  enabled: boolean
  monitoring: boolean
  frameIntervalMs?: number
}

export type ProctorState = {
  active: boolean
  ready: boolean
  missingFace: boolean
  missingFaceSeconds: number
  faceCount: number | null
  error: string | null
  videoRef: RefCallback<HTMLVideoElement>
  headerVideoRef: RefCallback<HTMLVideoElement>
  enableAlertAudio: () => void
  retry: () => void
  reset: () => void
}

function playWarningTone(context: AudioContext | null) {
  if (!context || context.state === "closed") return
  try {
    if (context.state === "suspended")
      void context.resume().catch(() => undefined)
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.frequency.value = Math.round(680 + Math.random() * 620)
    gain.gain.value = 0.08
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.13 + Math.random() * 0.1)
    oscillator.onended = () => {
      oscillator.disconnect()
      gain.disconnect()
    }
  } catch {
    // The visible warning remains available if browser audio is unavailable.
  }
}

/** Runs face checks on the candidate's device. Camera frames never leave the browser. */
export function useLocalFaceProctor({
  enabled,
  monitoring,
  frameIntervalMs = 750,
}: ProctorOptions): ProctorState {
  const videoElement = useRef<HTMLVideoElement | null>(null)
  const headerVideoElement = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const alertAudioRef = useRef<AudioContext | null>(null)
  const monitoringRef = useRef(monitoring)
  const noFaceSince = useRef<number | null>(null)
  const lastNoFaceBeepAt = useRef(0)
  const [retryCount, setRetryCount] = useState(0)
  const [active, setActive] = useState(false)
  const [faceCount, setFaceCount] = useState<number | null>(null)
  const [missingFace, setMissingFace] = useState(false)
  const [missingFaceSeconds, setMissingFaceSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)

  monitoringRef.current = monitoring

  const enableAlertAudio = useCallback(() => {
    if (typeof window === "undefined" || !window.AudioContext) return
    try {
      alertAudioRef.current ||= new window.AudioContext()
      if (alertAudioRef.current.state === "suspended")
        void alertAudioRef.current.resume().catch(() => undefined)
    } catch {
      // The visible camera warning remains available if audio is unavailable.
    }
  }, [])

  const videoRef = useCallback<RefCallback<HTMLVideoElement>>((video) => {
    const previousVideo = videoElement.current
    const currentStream = streamRef.current
    if (!video && previousVideo?.srcObject === currentStream) {
      previousVideo.srcObject = null
    }
    videoElement.current = video
    if (video && currentStream) {
      video.srcObject = currentStream
      void video.play().catch(() => undefined)
    } else if (video) {
      video.srcObject = null
    }
  }, [])

  const headerVideoRef = useCallback<RefCallback<HTMLVideoElement>>((video) => {
    const previousVideo = headerVideoElement.current
    const currentStream = streamRef.current
    if (!video && previousVideo?.srcObject === currentStream)
      previousVideo.srcObject = null
    headerVideoElement.current = video
    if (video && currentStream) {
      video.srcObject = currentStream
      void video.play().catch(() => undefined)
    } else if (video) {
      video.srcObject = null
    }
  }, [])

  const reset = useCallback(() => {
    noFaceSince.current = null
    lastNoFaceBeepAt.current = 0
    setMissingFace(false)
    setMissingFaceSeconds(0)
    setError(null)
  }, [])

  const retry = useCallback(() => {
    setError(null)
    setActive(false)
    setFaceCount(null)
    noFaceSince.current = null
    lastNoFaceBeepAt.current = 0
    setMissingFace(false)
    setMissingFaceSeconds(0)
    setRetryCount((current) => current + 1)
  }, [])

  useEffect(() => {
    if (!enabled) {
      setActive(false)
      setFaceCount(null)
      noFaceSince.current = null
      lastNoFaceBeepAt.current = 0
      setMissingFace(false)
      setMissingFaceSeconds(0)
      return
    }

    let disposed = false
    let timer = 0
    let frameInFlight = false
    let stream: MediaStream | undefined
    let worker: Worker | undefined
    noFaceSince.current = null
    lastNoFaceBeepAt.current = 0

    const setFailure = (message: string) => {
      if (disposed) return
      setError(message)
      setActive(false)
    }

    const processResult = (
      result: Extract<WorkerResponse, { type: "result" }>,
    ) => {
      if (disposed) return
      const now = Date.now()
      setFaceCount(result.faceCount)
      if (result.faceCount > 0) {
        noFaceSince.current = null
        lastNoFaceBeepAt.current = 0
        setMissingFace(false)
        setMissingFaceSeconds(0)
        return
      }
      if (!monitoringRef.current) {
        noFaceSince.current = null
        setMissingFace(false)
        setMissingFaceSeconds(0)
        return
      }

      if (noFaceSince.current === null) noFaceSince.current = now
      const elapsed = (now - noFaceSince.current) / 1000
      setMissingFaceSeconds(elapsed)
      // Allow brief false negatives caused by movement, lighting, or webcam quality.
      if (elapsed < 2) return
      setMissingFace(true)
      if (!lastNoFaceBeepAt.current || now - lastNoFaceBeepAt.current >= 5000) {
        lastNoFaceBeepAt.current = now
        playWarningTone(alertAudioRef.current)
      }
    }

    const inspectFrame = async () => {
      const visibleHeaderVideo = headerVideoElement.current?.getClientRects().length
        ? headerVideoElement.current
        : null
      const video = visibleHeaderVideo || videoElement.current || headerVideoElement.current
      if (
        disposed ||
        frameInFlight ||
        !worker ||
        !video?.videoWidth ||
        !video.videoHeight
      )
        return
      frameInFlight = true
      try {
        const canvas = document.createElement("canvas")
        const scale = Math.min(1, 640 / video.videoWidth)
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
        const context = canvas.getContext("2d")
        if (!context) throw new Error("Could not prepare the camera frame.")
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        const bitmap = await createImageBitmap(canvas)
        if (disposed || !worker) {
          bitmap.close()
          frameInFlight = false
          return
        }
        worker.postMessage(
          { type: "frame", bitmap, timestamp: performance.now() },
          [bitmap],
        )
      } catch (cause) {
        frameInFlight = false
        setFailure(
          cause instanceof Error
            ? cause.message
            : "Could not check the camera frame.",
        )
      }
    }

    const begin = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error(
            "This browser cannot access a webcam. Use a recent browser on HTTPS or localhost.",
          )
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        })
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        const video = videoElement.current || headerVideoElement.current
        if (!video)
          throw new Error(
            "Camera preview is not ready. Please retry the camera check.",
          )
        video.srcObject = stream
        await video.play()
        const headerVideo = headerVideoElement.current
        if (headerVideo && headerVideo !== video) {
          headerVideo.srcObject = stream
          void headerVideo.play().catch(() => undefined)
        }

        stream.getVideoTracks()[0]?.addEventListener(
          "ended",
          () => {
            setFailure(
              "The camera disconnected. Ask the invigilator for help before continuing.",
            )
          },
          { once: true },
        )

        worker = new Worker(
          new URL("../workers/faceLandmarker.worker.ts", import.meta.url),
          { type: "module" },
        )
        worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
          if (disposed) return
          if (event.data.type === "ready") {
            setActive(true)
            timer = window.setInterval(
              () => void inspectFrame(),
              Math.max(500, frameIntervalMs),
            )
            void inspectFrame()
          } else if (event.data.type === "result") {
            frameInFlight = false
            processResult(event.data)
          } else {
            frameInFlight = false
            setFailure(`Face checker error: ${event.data.message}`)
          }
        }
        worker.onerror = () => {
          frameInFlight = false
          setFailure(
            "The local face checker could not start. Please retry or ask the invigilator for help.",
          )
        }
        worker.postMessage({ type: "initialize" })
      } catch (cause) {
        setFailure(
          cause instanceof Error
            ? cause.message
            : "Could not start the camera check.",
        )
      }
    }

    void begin()
    return () => {
      disposed = true
      window.clearInterval(timer)
      worker?.terminate()
      stream?.getTracks().forEach((track) => track.stop())
      if (streamRef.current === stream) streamRef.current = null
      const video = videoElement.current
      if (video && video.srcObject === stream) video.srcObject = null
      const headerVideo = headerVideoElement.current
      if (headerVideo && headerVideo.srcObject === stream)
        headerVideo.srcObject = null
      noFaceSince.current = null
      setActive(false)
    }
  }, [
    enabled,
    frameIntervalMs,
    retryCount,
  ])

  return {
    active,
    ready: active && faceCount !== null && !error,
    missingFace,
    missingFaceSeconds,
    faceCount,
    error,
    videoRef,
    headerVideoRef,
    enableAlertAudio,
    retry,
    reset,
  }
}
