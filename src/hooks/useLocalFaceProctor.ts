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
  centered: boolean
  pose: {
    yaw: number
    pitch: number
    roll: number
  } | null
} | { type: "error"; message: string }

export type ProctorOptions = {
  enabled: boolean
  monitoring: boolean
  warningThresholdSeconds?: number
  lockoutThresholdSeconds?: number
  maxWarnings?: number
  frameIntervalMs?: number
  onLockout: (reason: string, warningCount: number) => void
}

export type ProctorState = {
  active: boolean
  ready: boolean
  warning: boolean
  warningCount: number
  awaySeconds: number
  faceCount: number | null
  centered: boolean | null
  lookingAway: boolean
  error: string | null
  videoRef: RefCallback<HTMLVideoElement>
  retry: () => void
  reset: () => void
}

function playWarningTone() {
  try {
    const context = new window.AudioContext()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.frequency.value = 740
    gain.gain.value = 0.08
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.18)
    oscillator.onended = () => void context.close()
  } catch {
    // The visible warning remains available if browser audio is unavailable.
  }
}

/** Runs face checks on the candidate's device. Camera frames never leave the browser. */
export function useLocalFaceProctor({
  enabled,
  monitoring,
  warningThresholdSeconds = 3,
  lockoutThresholdSeconds = 7,
  maxWarnings = 3,
  frameIntervalMs = 750,
  onLockout,
}: ProctorOptions): ProctorState {
  const videoElement = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const monitoringRef = useRef(monitoring)
  const awaySince = useRef<number | null>(null)
  const warningCountRef = useRef(0)
  const warningActive = useRef(false)
  const lockedRef = useRef(false)
  const lockoutRef = useRef(onLockout)
  const [retryCount, setRetryCount] = useState(0)
  const [active, setActive] = useState(false)
  const [faceCount, setFaceCount] = useState<number | null>(null)
  const [centered, setCentered] = useState<boolean | null>(null)
  const [lookingAway, setLookingAway] = useState(false)
  const [warning, setWarning] = useState(false)
  const [warningCount, setWarningCount] = useState(0)
  const [awaySeconds, setAwaySeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)

  monitoringRef.current = monitoring
  lockoutRef.current = onLockout

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

  const lock = useCallback((reason: string) => {
    if (lockedRef.current) return
    lockedRef.current = true
    lockoutRef.current(reason, warningCountRef.current)
  }, [])

  const reset = useCallback(() => {
    lockedRef.current = false
    warningCountRef.current = 0
    awaySince.current = null
    warningActive.current = false
    setWarningCount(0)
    setWarning(false)
    setAwaySeconds(0)
    setError(null)
  }, [])

  const retry = useCallback(() => {
    setError(null)
    setActive(false)
    setFaceCount(null)
    setCentered(null)
    setLookingAway(false)
    setRetryCount((current) => current + 1)
  }, [])

  useEffect(() => {
    if (!enabled) {
      setActive(false)
      setFaceCount(null)
      setCentered(null)
      setLookingAway(false)
      return
    }

    let disposed = false
    let timer = 0
    let frameInFlight = false
    let stream: MediaStream | undefined
    let worker: Worker | undefined

    const setFailure = (message: string) => {
      if (disposed) return
      setError(message)
      setActive(false)
    }

    const processResult = (
      result: Extract<WorkerResponse, { type: "result" }>,
    ) => {
      if (disposed) return
      setFaceCount(result.faceCount)
      setCentered(result.faceCount === 1 ? result.centered : false)
      const pose = result.pose
      const away =
        result.faceCount !== 1 ||
        !result.centered ||
        !pose ||
        Math.abs(pose.yaw) > 25 ||
        Math.abs(pose.pitch) > 20
      setLookingAway(away)

      if (!monitoringRef.current) {
        awaySince.current = null
        warningActive.current = false
        setWarning(false)
        setAwaySeconds(0)
        return
      }

      const now = Date.now()
      if (away) {
        if (awaySince.current === null) awaySince.current = now
        const elapsed = (now - awaySince.current) / 1000
        setAwaySeconds(elapsed)
        if (elapsed >= warningThresholdSeconds && !warningActive.current) {
          warningActive.current = true
          setWarning(true)
          warningCountRef.current += 1
          setWarningCount(warningCountRef.current)
          playWarningTone()
        }
        if (elapsed >= lockoutThresholdSeconds)
          lock("Continuous face-away threshold exceeded")
        if (warningCountRef.current >= maxWarnings)
          lock("Maximum proctoring warnings exceeded")
      } else {
        awaySince.current = null
        warningActive.current = false
        setAwaySeconds(0)
        setWarning(false)
      }
    }

    const inspectFrame = async () => {
      const video = videoElement.current
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
        const video = videoElement.current
        if (!video)
          throw new Error(
            "Camera preview is not ready. Please retry the camera check.",
          )
        video.srcObject = stream
        await video.play()

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
      awaySince.current = null
      warningActive.current = false
      setActive(false)
    }
  }, [
    enabled,
    frameIntervalMs,
    lock,
    lockoutThresholdSeconds,
    maxWarnings,
    retryCount,
    warningThresholdSeconds,
  ])

  return {
    active,
    ready:
      active && faceCount === 1 && centered === true && !lookingAway && !error,
    warning,
    warningCount,
    awaySeconds,
    faceCount,
    centered,
    lookingAway,
    error,
    videoRef,
    retry,
    reset,
  }
}
