import {
  FaceLandmarker,
  FilesetResolver,
  type Matrix,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision"

type WorkerRequest = { type: "initialize" } | {
  type: "frame"
  bitmap: ImageBitmap
  timestamp: number
}

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

type WorkerScope = {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<WorkerRequest>) => void,
  ): void
  postMessage(message: WorkerResponse): void
  location: Location
}

const worker = self as unknown as WorkerScope
let landmarker: FaceLandmarker | null = null

function degrees(value: number) {
  return value * (180 / Math.PI)
}

function getPose(matrix?: Matrix) {
  const data = matrix?.data
  if (!data || data.length < 16) return null

  // MediaPipe returns the face transform as a flattened 4x4 rotation matrix.
  // These Euler angles are used only for a gentle screen-facing reminder.
  const clamp = (value: number) => Math.max(-1, Math.min(1, value))
  return {
    yaw: degrees(Math.asin(clamp(-data[8]))),
    pitch: degrees(Math.atan2(data[9], data[10])),
    roll: degrees(Math.atan2(data[4], data[0])),
  }
}

function isCentered(landmarks: NormalizedLandmark[] = []) {
  if (!landmarks.length) return false
  const xs = landmarks.map((point) => point.x)
  const ys = landmarks.map((point) => point.y)
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2
  const centerY = (Math.min(...ys) + Math.max(...ys)) / 2
  return Math.abs(centerX - 0.5) <= 0.22 && Math.abs(centerY - 0.5) <= 0.25
}

worker.addEventListener("message", async (event) => {
  const request = event.data

  if (request.type === "initialize") {
    try {
      const files = await FilesetResolver.forVisionTasks(
        `${worker.location.origin}/mediapipe/wasm/`,
      )
      landmarker = await FaceLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: `${worker.location.origin}/models/face_landmarker.task`,
        },
        runningMode: "VIDEO",
        numFaces: 2,
        minFaceDetectionConfidence: 0.55,
        minFacePresenceConfidence: 0.55,
        minTrackingConfidence: 0.55,
        outputFacialTransformationMatrixes: true,
      })
      worker.postMessage({ type: "ready" })
    } catch (cause) {
      worker.postMessage({
        type: "error",
        message:
          cause instanceof Error
            ? cause.message
            : "Face checker could not load.",
      })
    }
    return
  }

  try {
    if (!landmarker) throw new Error("Face checker is still starting.")
    const result = landmarker.detectForVideo(request.bitmap, request.timestamp)
    const faceCount = result.faceLandmarks.length
    worker.postMessage({
      type: "result",
      faceCount,
      centered: faceCount === 1 && isCentered(result.faceLandmarks[0]),
      pose:
        faceCount === 1
          ? getPose(result.facialTransformationMatrixes[0])
          : null,
    })
  } catch (cause) {
    worker.postMessage({
      type: "error",
      message:
        cause instanceof Error
          ? cause.message
          : "Could not check this camera frame.",
    })
  } finally {
    request.bitmap.close()
  }
})
