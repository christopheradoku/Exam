import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision"

type WorkerRequest = { type: "initialize" } | {
  type: "frame"
  bitmap: ImageBitmap
  timestamp: number
}

type WorkerResponse = { type: "ready" } | {
  type: "result"
  faceCount: number
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
        // Only face presence is used. One returned face is enough, with
        // relaxed thresholds to tolerate ordinary lighting and webcam quality.
        numFaces: 1,
        minFaceDetectionConfidence: 0.45,
        minFacePresenceConfidence: 0.45,
        minTrackingConfidence: 0.45,
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
