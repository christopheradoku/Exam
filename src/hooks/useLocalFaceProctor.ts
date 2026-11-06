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
  faceSignature: number[] | null
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
  identityReady: boolean
  identityMatch: boolean | null
  lookingAway: boolean
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

function signatureDistance(first: number[], second: number[]) {
  if (first.length !== second.length || !first.length) return Number.POSITIVE_INFINITY
  let squaredError = 0
  for (let i = 0; i < first.length; i++) squaredError += (first[i] - second[i]) ** 2
  return Math.sqrt(squaredError / first.length)
}

function averageSignatures(samples: number[][]) {
  return samples[0].map((_, index) =>
    samples.reduce((total, sample) => total + sample[index], 0) / samples.length,
  )
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
  const headerVideoElement = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const alertAudioRef = useRef<AudioContext | null>(null)
  const identitySignatureRef = useRef<number[] | null>(null)
  const identitySamplesRef = useRef<number[][]>([])
  const lastFaceAlertAt = useRef(0)
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
  const [identityReady, setIdentityReady] = useState(false)
  const [identityMatch, setIdentityMatch] = useState<boolean | null>(null)
  const [lookingAway, setLookingAway] = useState(false)
  const [warning, setWarning] = useState(false)
  const [warningCount, setWarningCount] = useState(0)
  const [awaySeconds, setAwaySeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)

  monitoringRef.current = monitoring
  lockoutRef.current = onLockout

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
    setIdentityReady(false)
    setIdentityMatch(null)
    setLookingAway(false)
    setRetryCount((current) => current + 1)
  }, [])

  useEffect(() => {
    if (!enabled) {
      setActive(false)
      setFaceCount(null)
      setCentered(null)
      identitySignatureRef.current = null
      identitySamplesRef.current = []
      setIdentityReady(false)
      setIdentityMatch(null)
      setLookingAway(false)
      return
    }

    let disposed = false
    let timer = 0
    let frameInFlight = false
    let stream: MediaStream | undefined
    let worker: Worker | undefined
    identitySignatureRef.current = null
    identitySamplesRef.current = []
    lastFaceAlertAt.current = 0
    setIdentityReady(false)
    setIdentityMatch(null)

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
      setCentered(result.faceCount === 1 ? result.centered : false)
      const pose = result.pose
      const frontal = Boolean(
        pose && Math.abs(pose.yaw) <= 25 && Math.abs(pose.pitch) <= 20,
      )
      let identityMismatch = false

      if (result.faceCount > 1) {
        identityMismatch = true
        if (!identitySignatureRef.current) identitySamplesRef.current = []
        setIdentityMatch(false)
      } else if (
        result.faceCount === 1 &&
        result.centered &&
        frontal &&
        result.faceSignature
      ) {
        if (!identitySignatureRef.current) {
          const previousSample = identitySamplesRef.current.at(-1)
          if (
            previousSample &&
            signatureDistance(previousSample, result.faceSignature) > 0.075
          )
            identitySamplesRef.current = []
          identitySamplesRef.current.push(result.faceSignature)
          if (identitySamplesRef.current.length >= 3) {
            identitySignatureRef.current = averageSignatures(
              identitySamplesRef.current.slice(-3),
            )
            setIdentityReady(true)
            setIdentityMatch(true)
          } else {
            setIdentityMatch(null)
          }
        } else {
          identityMismatch =
            signatureDistance(
              identitySignatureRef.current,
              result.faceSignature,
            ) > 0.075
          setIdentityMatch(!identityMismatch)
        }
      } else {
        if (!identitySignatureRef.current) identitySamplesRef.current = []
        setIdentityMatch(null)
      }

      if (identityMismatch && now - lastFaceAlertAt.current >= 1800) {
        lastFaceAlertAt.current = now
        playWarningTone(alertAudioRef.current)
      }

      const away =
        result.faceCount !== 1 ||
        !result.centered ||
        identityMismatch ||
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

      if (away) {
        if (awaySince.current === null) awaySince.current = now
        const elapsed = (now - awaySince.current) / 1000
        setAwaySeconds(elapsed)
        if (elapsed >= warningThresholdSeconds && !warningActive.current) {
          warningActive.current = true
          setWarning(true)
          warningCountRef.current += 1
          setWarningCount(warningCountRef.current)
          playWarningTone(alertAudioRef.current)
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
      active && faceCount === 1 && centered === true && identityReady && identityMatch === true && !lookingAway && !error,
    warning,
    warningCount,
    awaySeconds,
    faceCount,
    centered,
    identityReady,
    identityMatch,
    lookingAway,
    error,
    videoRef,
    headerVideoRef,
    enableAlertAudio,
    retry,
    reset,
  }
}
