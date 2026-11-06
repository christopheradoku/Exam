"use client"
// Timer starts once when the candidate enters; changing paper doesn't reset it.
import { useEffect, useMemo, useRef, useState } from "react"
import type { FormEvent } from "react"
import { useLocalFaceProctor } from "./hooks/useLocalFaceProctor"
import type { ObjectiveQuestion, TheoryPart } from "./lib/examTypes"
import { defaultGradeBands, type GradeBand } from "./lib/portalTypes"
import type { StudentProfile } from "./lib/studentTypes"

type StudentExamData = {
  id: string
  title: string
  subject: string
  startTime: string
  endTime: string
  durationMinutes: number
  maxAttempts: number
  gradeBands: GradeBand[]
  photoUploadWindowMinutes?: number
  questions: { paper1: ObjectiveQuestion[]; paper2: TheoryPart[] }
}

function percentageGrade(score: number, maximum: number, bands: GradeBand[]) {
  if (!maximum || !bands.length) return null
  const percentage = (score / maximum) * 100
  return bands.find(
    (band) => percentage >= band.minimum && percentage <= band.maximum,
  )?.label || null
}

function gradeToneFor(grade: string | null, percentage: number) {
  const gradeLetter = grade?.trim().toUpperCase().match(/^([A-F])(?:\d|$)/)?.[1]
  if (gradeLetter === "A" || gradeLetter === "B") return "high"
  if (gradeLetter === "C" || gradeLetter === "D") return "middle"
  if (gradeLetter === "E" || gradeLetter === "F") return "low"
  return percentage >= 70 ? "high" : percentage >= 50 ? "middle" : "low"
}

function gradeRecommendation(grade: string | null, tone: string) {
  if (grade?.trim().toUpperCase().startsWith("A"))
    return "Excellent work. Keep practising to maintain this standard."
  if (tone === "high")
    return "Strong result. Review missed questions to reach the top grade band."
  if (tone === "middle")
    return "Good progress. Review missed topics and practise them before your next test."
  return "This result needs improvement. Revisit the core topics and ask your teacher for support."
}
type Attempt = {
  id: string
  objectiveScore: number
  objectiveMax: number
  theoryScore?: number
  theoryMax?: number
  status?: "submitted" | "locked" | "graded"
}
type AttemptSummary = {
  attemptsUsed: number
  maxAttempts: number
  attemptsRemaining: number
  canRetry: boolean
}
type AnswerKey = {
  paper1: ObjectiveQuestion[]
  paper2: TheoryPart[]
}
type Screen = "gate" | "preflight" | "paper1" | "paper2" | "upload" | "submitted"

async function compressHandwrittenPhoto(file: File) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1500 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const context = canvas.getContext("2d")
  if (!context) throw new Error("Could not prepare the photo. Try another image.")
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  let quality = 0.76
  let image = canvas.toDataURL("image/jpeg", quality)
  while (image.length > 1_450_000 && quality > 0.42) {
    quality -= 0.08
    image = canvas.toDataURL("image/jpeg", quality)
  }
  if (image.length > 1_500_000)
    throw new Error("This photo is too large. Retake it closer to the page in good light.")
  return image
}

async function verifyStudentAccess(
  examId: string,
  action: "enter" | "start" = "enter",
) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 15000)
  try {
    const response = await fetch(`/api/student/exams/${examId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
      signal: controller.signal,
    })
    return { response, body: await response.json() }
  } catch (cause) {
    if (controller.signal.aborted)
      throw new Error("Verification timed out. Check your connection to the exam server and try again.")
    throw cause
  } finally {
    window.clearTimeout(timeout)
  }
}

async function enterExamFullscreen() {
  if (document.fullscreenElement) return
  if (!document.documentElement.requestFullscreen)
    throw new Error(
      "Fullscreen is required for this examination. Open it in a browser that supports fullscreen mode and try again.",
    )
  try {
    await document.documentElement.requestFullscreen()
  } catch {
    throw new Error(
      "Fullscreen is required. Allow fullscreen mode in your browser, then press Start exam again.",
    )
  }
  if (!document.fullscreenElement)
    throw new Error("Fullscreen could not be enabled. Press Start exam to try again.")
}

function exitExamFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
}

function formatClock(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(
    seconds % 60,
  ).padStart(2, "0")}`
}
function formatWaitClock(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
}

function createExamPreview(
  examId: string,
  preview: Partial<StudentExamData>,
): StudentExamData {
  return {
    id: examId,
    title: preview.title || "Scheduled examination",
    subject: preview.subject || "",
    startTime: preview.startTime || "",
    endTime: preview.endTime || "",
    durationMinutes: preview.durationMinutes || 0,
    maxAttempts: preview.maxAttempts ?? 1,
    gradeBands: preview.gradeBands ?? defaultGradeBands,
    questions: { paper1: [], paper2: [] },
  }
}

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">W</span>
      <span className="brand-type">
        <strong>Virtual Exam</strong>
        <small>Secure examination portal</small>
      </span>
    </div>
  )
}

function ExamText({ text }: { text: string }) {
  const tokens = text.split(/(\^\{[^}]+\}|\^[+-]?\d+|_\{[^}]+\}|_[+-]?\d+|\)\d+|[A-Z][a-z]?\d+)/g)
  return (
    <>
      {tokens.map((token, index) => {
        if (token.startsWith("^"))
          return <sup key={index}>{token.startsWith("^{") ? token.slice(2, -1) : token.slice(1)}</sup>
        if (token.startsWith("_"))
          return <sub key={index}>{token.startsWith("_{") ? token.slice(2, -1) : token.slice(1)}</sub>
        const groupIndex = token.match(/^\)(\d+)$/)
        if (groupIndex)
          return <span key={index}>)<sub>{groupIndex[1]}</sub></span>
        const formula = token.match(/^([A-Z][a-z]?)(\d+)$/)
        return formula ? (
          <span key={index}>{formula[1]}<sub>{formula[2]}</sub></span>
        ) : (
          <span key={index}>{token}</span>
        )
      })}
    </>
  )
}

function TheoryResponse({
  question,
  answers,
  setAnswer,
}: {
  question: TheoryPart
  answers: Record<string, string>
  setAnswer: (id: string, value: string) => void
}) {
  function renderPart(part: TheoryPart, depth = 0): React.ReactNode {
    return (
      <div
        className={`theory-subpart depth-${Math.min(depth, 3)}`}
        key={part.id}
      >
        <div className="theory-subpart-title">
          <strong>{part.label || "Sub-question"}</strong>
          <span>{part.marks} marks</span>
        </div>
        <p><ExamText text={part.prompt} /></p>
        {part.parts?.length ? (
          part.parts.map((child) => renderPart(child, depth + 1))
        ) : (
          <textarea
            className="student-answer"
            value={answers[part.id] || ""}
            onChange={(event) => setAnswer(part.id, event.target.value)}
            placeholder="Write your answer clearly, including working where needed."
          />
        )}
      </div>
    )
  }
  return (
    <article id={`question-${question.id}`} className="student-question">
      <span className="question-count">
        QUESTION {question.label || question.id} <i>{question.marks} marks</i>
      </span>
      <h2><ExamText text={question.prompt} /></h2>
      {question.allowPhotoUpload && (
        <p className="handwriting-hint">
          You may write this answer on paper while camera supervision is active, then photograph it during the final upload window.
        </p>
      )}
      {question.parts?.length ? (
        question.parts.map((part) => renderPart(part))
      ) : (
        <textarea
          className="student-answer"
          value={answers[question.id] || ""}
          onChange={(event) => setAnswer(question.id, event.target.value)}
          placeholder="Write your answer clearly. You may include working and explanations."
        />
      )}
    </article>
  )
}

export default function StudentExam({ examId }: { examId: string }) {
  const [candidateName, setCandidateName] = useState("")
  const [candidateNumber, setCandidateNumber] = useState("")
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null)
  const [identityReady, setIdentityReady] = useState(false)
  const [identityError, setIdentityError] = useState("")
  const [exam, setExam] = useState<StudentExamData | null>(null)
  const [screen, setScreen] = useState<Screen>("gate")
  const [gate, setGate] = useState<"early" | "closed" | "">("")
  const [now, setNow] = useState(Date.now())
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [photoAnswers, setPhotoAnswers] = useState<Record<string, string>>({})
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [autoSubmitReason, setAutoSubmitReason] = useState("")
  const [remaining, setRemaining] = useState(0)
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [attemptSummary, setAttemptSummary] = useState<AttemptSummary | null>(null)
  const [paper2Pending, setPaper2Pending] = useState(false)
  const [answerKeyData, setAnswerKeyData] = useState<AnswerKey | null>(null)
  const [answerKeyLoading, setAnswerKeyLoading] = useState(false)
  const [answerKeyError, setAnswerKeyError] = useState("")
  const [uploadSeconds, setUploadSeconds] = useState(0)
  const [photoBusyQuestion, setPhotoBusyQuestion] = useState("")
  const [proctorOn, setProctorOn] = useState(false)
  const [isMobilePhone, setIsMobilePhone] = useState(false)
  const answerKey = `wassce-answers-${examId}-${studentProfile?.id || "unverified"}`
  const formRef = useRef<HTMLFormElement>(null)
  const autoSubmitTriggeredRef = useRef(false)
  const autoSubmitRef = useRef<(reason: string) => void>(() => undefined)
  const deadlineAt = useRef(0)
  const photoUploadDeadlineAt = useRef(0)

  useEffect(() => {
    let mounted = true
    fetch("/api/student-auth/session", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json()
        if (!mounted) return
        const student = body.student as StudentProfile | null
        if (!response.ok || !body.authenticated || !student) {
          const next = encodeURIComponent(`/exam/${examId}`)
          window.location.replace(`/student?next=${next}`)
          return
        }
        if (student.mustChangePassword) {
          window.location.replace("/student")
          return
        }
        setStudentProfile(student)
        setCandidateName(student.fullName)
        setCandidateNumber(student.waecCandidateNumber || student.studentNumber)
        setIdentityReady(true)
      })
      .catch(() => {
        if (!mounted) return
        setIdentityError("Could not verify your student session. Return to the student portal and sign in again.")
        setIdentityReady(true)
      })
    return () => { mounted = false }
  }, [examId])

  const isExamScreen = screen === "paper1" || screen === "paper2"
  const proctor = useLocalFaceProctor({
    enabled: screen === "preflight" || (proctorOn && isExamScreen),
    monitoring: proctorOn && isExamScreen,
  })

  useEffect(() => {
    if (!proctorOn || !isExamScreen) return
    let fullscreenWasEntered = Boolean(document.fullscreenElement)
    const autoSubmit = (reason: string) => {
      if (autoSubmitTriggeredRef.current) return
      autoSubmitTriggeredRef.current = true
      autoSubmitRef.current(reason)
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden")
        autoSubmit("The exam tab was left or hidden")
    }
    const onFullscreenChange = () => {
      if (document.fullscreenElement) fullscreenWasEntered = true
      else if (fullscreenWasEntered) autoSubmit("Fullscreen mode was exited")
    }
    const onPageHide = () => autoSubmit("The exam page was left")
    const onBeforeUnload = () => autoSubmit("The exam page was closed or refreshed")
    // Browsers can fire blur during ordinary mobile UI transitions. Only submit
    // for a blur if the page actually becomes hidden; visibilitychange handles
    // that case too, while this delay avoids false submissions on focus changes.
    const onWindowBlur = () => {
      window.setTimeout(() => {
        if (document.visibilityState === "hidden")
          autoSubmit("The exam tab was left or hidden")
      }, 250)
    }
    const preventClipboardAction = (event: Event) => event.preventDefault()
    const preventClipboardShortcut = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      const modifier = event.ctrlKey || event.metaKey
      if (
        (modifier && ["a", "c", "x", "v"].includes(key)) ||
        ((event.shiftKey || event.ctrlKey) && key === "insert") ||
        (event.shiftKey && key === "delete")
      ) {
        event.preventDefault()
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange)
    document.addEventListener("fullscreenchange", onFullscreenChange)
    document.addEventListener("copy", preventClipboardAction, true)
    document.addEventListener("cut", preventClipboardAction, true)
    document.addEventListener("paste", preventClipboardAction, true)
    document.addEventListener("selectstart", preventClipboardAction, true)
    document.addEventListener("contextmenu", preventClipboardAction, true)
    document.addEventListener("dragstart", preventClipboardAction, true)
    document.addEventListener("keydown", preventClipboardShortcut, true)
    window.addEventListener("pagehide", onPageHide)
    window.addEventListener("beforeunload", onBeforeUnload)
    window.addEventListener("blur", onWindowBlur)
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange)
      document.removeEventListener("fullscreenchange", onFullscreenChange)
      document.removeEventListener("copy", preventClipboardAction, true)
      document.removeEventListener("cut", preventClipboardAction, true)
      document.removeEventListener("paste", preventClipboardAction, true)
      document.removeEventListener("selectstart", preventClipboardAction, true)
      document.removeEventListener("contextmenu", preventClipboardAction, true)
      document.removeEventListener("dragstart", preventClipboardAction, true)
      document.removeEventListener("keydown", preventClipboardShortcut, true)
      window.removeEventListener("pagehide", onPageHide)
      window.removeEventListener("beforeunload", onBeforeUnload)
      window.removeEventListener("blur", onWindowBlur)
    }
  }, [isExamScreen, proctorOn])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    const phoneQuery = window.matchMedia("(max-width: 720px)")
    const isPhoneDevice = /Mobi|Android.*Mobile|iPhone|iPod|Windows Phone/i.test(
      navigator.userAgent,
    )
    const update = () => setIsMobilePhone(phoneQuery.matches || isPhoneDevice)
    update()
    phoneQuery.addEventListener("change", update)
    return () => phoneQuery.removeEventListener("change", update)
  }, [])
  useEffect(() => {
    if (!exam || !["paper1", "paper2", "upload"].includes(screen)) return
    try {
      sessionStorage.setItem(
        answerKey,
        JSON.stringify({ answers, photoAnswers, candidateNumber }),
      )
    } catch {
      sessionStorage.setItem(
        answerKey,
        JSON.stringify({ answers, candidateNumber }),
      )
    }
  }, [answerKey, answers, photoAnswers, candidateNumber, exam, screen])
  useEffect(() => {
    if (!exam || !["paper1", "paper2"].includes(screen)) return
    if (!deadlineAt.current) return
    const tick = () => {
      const seconds = Math.max(
        0,
        Math.ceil((deadlineAt.current - Date.now()) / 1000),
      )
      setRemaining(seconds)
      if (seconds === 0) formRef.current?.requestSubmit()
    }
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [exam?.id, screen])

  useEffect(() => {
    if (screen !== "upload" || !photoUploadDeadlineAt.current) return
    const tick = () => {
      const seconds = Math.max(0, Math.ceil((photoUploadDeadlineAt.current - Date.now()) / 1000))
      setUploadSeconds(seconds)
      if (seconds === 0 && !photoBusyQuestion) formRef.current?.requestSubmit()
    }
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [screen, photoBusyQuestion])

  const countdown = useMemo(
    () =>
      exam?.startTime
        ? Math.max(0, Math.ceil((Date.parse(exam.startTime) - now) / 1000))
        : 0,
    [exam?.startTime, now],
  )

  async function enter(event?: FormEvent) {
    event?.preventDefault()
    proctor.enableAlertAudio()
    setBusy(true)
    setError("")
    try {
      const { response, body } = await verifyStudentAccess(examId)
      if (body.gate === "early") {
        setGate("early")
        if (body.startTime)
          setExam((current) => current || createExamPreview(examId, body))
        setScreen("preflight")
        setError("")
        return
      }
      if (body.gate === "closed") {
        setGate("closed")
        return
      }
      if (!response.ok)
        throw new Error(body.error || "Unable to enter this exam.")
      setExam(body.exam)
      setGate("")
      const saved = sessionStorage.getItem(answerKey)
      const savedAttempt = saved
        ? JSON.parse(saved) as {
            answers?: Record<string, string>
            photoAnswers?: Record<string, string>
            candidateNumber?: string
          }
        : null
      setAnswers(
        savedAttempt?.candidateNumber === candidateNumber
          ? savedAttempt.answers || {}
          : {},
      )
      setPhotoAnswers(
        savedAttempt?.candidateNumber === candidateNumber
          ? savedAttempt.photoAnswers || {}
          : {},
      )
      autoSubmitTriggeredRef.current = false
      setAutoSubmitReason("")
      proctor.reset()
      setProctorOn(false)
      setScreen("preflight")
    } catch (cause) {
      setGate("")
      setError(
        cause instanceof Error ? cause.message : "Unable to enter this exam.",
      )
    } finally {
      setBusy(false)
    }
  }

  async function beginExam() {
    proctor.enableAlertAudio()
    if (!proctor.ready) {
      setError(
        "Complete the camera check before starting. If the camera cannot detect you, ask the invigilator for help.",
      )
      return
    }
    setBusy(true)
    setError("")
    try {
      await enterExamFullscreen()
      const { response, body } = await verifyStudentAccess(examId, "start")
      if (body.gate === "early") {
        exitExamFullscreen()
        setGate("early")
        if (body.startTime)
          setExam((current) => current || createExamPreview(examId, body))
        return
      }
      if (body.gate === "closed") {
        exitExamFullscreen()
        setGate("closed")
        setScreen("gate")
        setError("This examination has closed. Contact your invigilator.")
        return
      }
      if (!response.ok)
        throw new Error(body.error || "Unable to start this exam.")
      if (!document.fullscreenElement)
        throw new Error("Stay in fullscreen mode to start the exam. Press Start exam again.")
      setExam(body.exam)
      setGate("")
      autoSubmitTriggeredRef.current = false
      setAutoSubmitReason("")
      proctor.reset()
      setProctorOn(true)
      const allotted = Number(body.exam.durationMinutes || 60) * 60
      setRemaining(allotted)
      deadlineAt.current = body.deadlineAt
        ? Date.parse(body.deadlineAt)
        : Math.min(Date.now() + allotted * 1000, Date.parse(body.exam.endTime))
      setScreen("paper1")
    } catch (cause) {
      exitExamFullscreen()
      setError(
        cause instanceof Error ? cause.message : "Unable to start this exam.",
      )
    } finally {
      setBusy(false)
    }
  }

  async function submit(
    event?: FormEvent,
    automatic = false,
    automaticReason = "",
  ) {
    event?.preventDefault()
    if (!exam || (busy && !automatic) || screen === "submitted") return
    if (automatic) {
      setAutoSubmitReason(automaticReason)
      setError("")
    } else {
      setAutoSubmitReason("")
    }
    if (
      !automatic &&
      screen !== "upload" &&
      (exam.photoUploadWindowMinutes || 0) > 0 &&
      exam.questions.paper2.some((question) => question.allowPhotoUpload)
    ) {
      setBusy(true)
      setError("")
      try {
        const response = await fetch(`/api/student/exams/${examId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "open-photo-upload",
          }),
        })
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || "Could not open the photo upload window.")
        if (autoSubmitTriggeredRef.current) return
        photoUploadDeadlineAt.current = Date.parse(body.closesAt)
        setUploadSeconds(Math.max(0, Math.ceil((photoUploadDeadlineAt.current - Date.now()) / 1000)))
        setProctorOn(false)
        setScreen("upload")
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not open the photo upload window.")
      } finally {
        setBusy(false)
      }
      return
    }
    setBusy(true)
    setError("")
    setProctorOn(false)
    try {
      const response = await fetch(`/api/student/exams/${examId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: automatic,
        body: JSON.stringify({
          action: "submit",
          answers,
          photoAnswers,
        }),
      })
      const body = await response.json()
      if (!response.ok)
        throw new Error(body.error || "Could not submit your answers.")
      setAttempt(body.attempt)
      setAttemptSummary({
        attemptsUsed: body.attemptsUsed,
        maxAttempts: body.maxAttempts,
        attemptsRemaining: body.attemptsRemaining,
        canRetry: body.canRetry,
      })
      setPaper2Pending(body.paper2Pending)
      setScreen("submitted")
      sessionStorage.removeItem(answerKey)
      exitExamFullscreen()
    } catch (cause) {
      if (automatic) {
        autoSubmitTriggeredRef.current = false
        setAutoSubmitReason("")
        setProctorOn(true)
      }
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not submit your answers.",
      )
    } finally {
      setBusy(false)
    }
  }

  autoSubmitRef.current = (reason) => {
    void submit(undefined, true, reason)
  }

  const setAnswer = (id: string, value: string) =>
    setAnswers((current) => ({ ...current, [id]: value }))

  const totalQuestionCount =
    (exam?.questions.paper1.length || 0) + (exam?.questions.paper2.length || 0)
  const answeredQuestionCount = exam
    ? [...exam.questions.paper1, ...exam.questions.paper2].filter(
        (question) => answers[question.id]?.trim(),
      ).length
    : 0
  const answerProgress =
    totalQuestionCount > 0
      ? Math.round((answeredQuestionCount / totalQuestionCount) * 100)
      : 0

  const totalScore =
    (attempt?.objectiveScore || 0) +
    (attempt?.theoryMax !== undefined ? attempt.theoryScore || 0 : 0)
  const totalMaximum =
    (attempt?.objectiveMax || 0) +
    (attempt?.theoryMax !== undefined ? attempt.theoryMax : 0)
  const overallPercentage = totalMaximum ? (totalScore / totalMaximum) * 100 : 0
  const overallGrade = attempt
    ? percentageGrade(totalScore, totalMaximum, exam?.gradeBands || [])
    : null
  const overallGradeTone = overallGrade
    ? gradeToneFor(overallGrade, overallPercentage)
    : "pending"
  const theoryMarkingPending = Boolean(
    attempt &&
      attempt.theoryMax === undefined &&
      exam?.questions.paper2.length,
  )
  const examClosed = Boolean(exam && Date.now() > Date.parse(exam.endTime))

  async function viewAnswerKey() {
    setAnswerKeyLoading(true)
    setAnswerKeyError("")
    try {
      const response = await fetch(`/api/student/exams/${examId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "answer-key" }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Could not load the answers.")
      if (!body.available) {
        setAnswerKeyError(
          `Answers will be available after the exam closes at ${new Date(body.closesAt).toLocaleString()}.`,
        )
        return
      }
      setAnswerKeyData(body as AnswerKey)
    } catch (cause) {
      setAnswerKeyError(cause instanceof Error ? cause.message : "Could not load the answers.")
    } finally {
      setAnswerKeyLoading(false)
    }
  }

  if (!identityReady)
    return <main className="student-page"><div className="student-gate"><Brand /><span className="eyebrow">STUDENT ACCOUNT</span><h1>Checking your sign-in</h1><p>Verifying your student session before opening the exam.</p></div></main>

  if (identityError)
    return <main className="student-page"><div className="student-gate"><Brand /><span className="eyebrow">STUDENT ACCOUNT</span><h1>Sign-in required</h1><p>{identityError}</p><a className="primary-button" href={`/student?next=${encodeURIComponent(`/exam/${examId}`)}`}>Return to student sign-in</a></div></main>

  if (screen === "submitted")
    return (
      <main className="student-page">
        <section className="student-result">
          <span className="result-check">✓</span>
          <span className="eyebrow">SUBMISSION RECEIVED</span>
          <h1>Exam submitted</h1>
          <p>
            {autoSubmitReason
              ? `Your exam was automatically submitted because ${autoSubmitReason.toLowerCase()}. Your teacher will review the result.`
              : "Your responses have been saved. AI marking is provisional and your teacher will review the result."}
          </p>
          {attemptSummary && (
            <div className="pending-banner">
              Attempt {attemptSummary.attemptsUsed} of {attemptSummary.maxAttempts} submitted.
              {attemptSummary.canRetry
                ? ` You have ${attemptSummary.attemptsRemaining} ${attemptSummary.attemptsRemaining === 1 ? "attempt" : "attempts"} remaining before the exam closes.`
                : attemptSummary.attemptsRemaining > 0
                  ? ` ${attemptSummary.attemptsRemaining} ${attemptSummary.attemptsRemaining === 1 ? "attempt" : "attempts"} remain, but the exam is closed.`
                  : " No attempts remain."}
            </div>
          )}
          <div className="result-score">
            <div>
              <small>PAPER 1 · OBJECTIVE</small>
              <strong>
                {attempt?.objectiveScore ?? 0}
                <i> / {attempt?.objectiveMax ?? 0}</i>
              </strong>
            </div>
            {attempt?.theoryMax !== undefined && (
              <div>
                <small>PAPER 2 · THEORY</small>
                <strong>
                  {attempt.theoryScore ?? 0}
                  <i> / {attempt.theoryMax}</i>
                </strong>
              </div>
            )}
          </div>
          {attempt && (
            <div className={`result-grade grade-${overallGradeTone}`}>
              <small>{theoryMarkingPending ? "PROVISIONAL GRADE" : "OVERALL GRADE"}</small>
              <strong>{overallGrade || "—"}</strong>
              <span>
                {theoryMarkingPending
                  ? "Paper 2 is still being marked, so this grade may change."
                  : overallGrade
                    ? gradeRecommendation(overallGrade, overallGradeTone)
                    : "Your overall grade is not available yet."}
              </span>
            </div>
          )}
          {paper2Pending && (
            <div className="pending-banner">
              Theory responses are saved and waiting for AI grading. Your
              teacher will see the updated report when grading is available.
            </div>
          )}
          <div className="answer-review-panel">
            <div>
              <strong>Review correct answers</strong>
              <small>
                {examClosed
                  ? "The examination is closed. You can now review the answer key."
                  : `Answers unlock when the examination closes at ${new Date(exam?.endTime || "").toLocaleString()}.`}
              </small>
            </div>
            <button
              className="secondary-button"
              onClick={() => void viewAnswerKey()}
              disabled={!examClosed || answerKeyLoading}
            >
              {answerKeyLoading ? "Loading…" : answerKeyData ? "Answers shown" : "View answers"}
            </button>
          </div>
          {answerKeyError && <div className="inline-error">{answerKeyError}</div>}
          {answerKeyData && (
            <div className="answer-key-list">
              {answerKeyData.paper1.map((question, index) => {
                const correct = question.options.find(
                  (option) => option.id === question.correctOptionId,
                )
                return (
                  <article key={question.id}>
                    <small>QUESTION {index + 1}</small>
                    <strong>{question.stem}</strong>
                    <span>Correct answer: {correct?.label}. {correct?.text}</span>
                  </article>
                )
              })}
              {answerKeyData.paper2.map((question, index) => (
                <article key={question.id}>
                  <small>THEORY {index + 1}</small>
                  <strong>{question.prompt}</strong>
                  <span>Model answer: {question.expectedAnswer || "See the marking guide."}</span>
                </article>
              ))}
            </div>
          )}
          <small className="receipt-id">
            SUBMISSION ID · {attempt?.id.slice(0, 8).toUpperCase()}
          </small>
          {attemptSummary?.canRetry && (
            <a className="primary-button" href={`/exam/${examId}`}>
              Retry exam · {attemptSummary.attemptsRemaining} left
            </a>
          )}
          <a className="primary-button" href="/student?view=history">View attempt history</a>
        </section>
      </main>
    )

  if (screen === "preflight") {
    const cameraStatus = proctor.error
      ? "Camera check needs attention"
      : !proctor.active
        ? "Starting camera and face check…"
        : proctor.faceCount === null
          ? "Camera is on; checking your face…"
          : proctor.faceCount === 0
            ? "No face detected yet. You can still start; the exam will beep if this continues."
            : "Camera check ready. You can move naturally during the exam."
    const cameraStatusClass = proctor.error
      ? "preflight-status is-error"
      : proctor.ready
        ? "preflight-status is-ready"
        : "preflight-status is-waiting"

    return (
      <main className="student-page student-preflight-page">
        <section className="student-preflight">
          <Brand />
          <div className="preflight-heading">
            <span className="eyebrow">PRE-EXAM CAMERA CHECK</span>
            <h1>Get set before the exam</h1>
            {exam?.title && (
              <div className="preflight-exam-label">
                <strong>{exam.title}</strong>
                {exam.subject && <span>{exam.subject} · WASSCE Standard</span>}
              </div>
            )}
            <p>
              Check your camera and review these guidelines. The exam timer
              starts only after you press “Start exam”.
            </p>
          </div>

          <div className="preflight-layout">
            <section className="preflight-camera-card">
              <div className="preflight-video-shell">
                <video ref={proctor.videoRef} autoPlay muted playsInline />
                <span className="preflight-live">
                  <i /> LIVE CAMERA CHECK
                </span>
              </div>
              <div
                className={cameraStatusClass}
                role="status"
                aria-live="polite"
              >
                <i />
                <span>{cameraStatus}</span>
              </div>
              {proctor.error && (
                <div className="preflight-camera-error">
                  {proctor.error}
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={proctor.retry}
                  >
                    Retry camera
                  </button>
                </div>
              )}
              <p className="preflight-privacy">
                Camera frames are checked on this device and are not uploaded.
              </p>
            </section>

            <section className="preflight-guidelines">
              <span className="eyebrow">CAMERA GUIDANCE</span>
              <h2>Keep the camera available</h2>
              <ol>
                <li>Allow camera access and keep the preview available during the exam.</li>
                <li>Sit in a comfortable position with ordinary room lighting.</li>
                <li>Small movements, looking down to write, glasses, and changes in lighting are okay.</li>
              </ol>
              <div className="preflight-warning-note">
                <strong>Face presence only</strong>
                <p>
                  The camera only checks whether it detects at least one face. It does not compare identity, direction, or position. Brief detection gaps are ignored. During the exam, if no face is detected for about two seconds, you will hear a reminder beep every few seconds until a face is visible again. Face detection will not lock or submit your exam.
                </p>
              </div>
              <div className="preflight-candidate">
                <span>
                  {candidateName.trim().slice(0, 1).toUpperCase() || "S"}
                </span>
                <div>
                  <strong>{candidateName}</strong>
                  <small>Candidate number · {candidateNumber}</small>
                </div>
              </div>
            </section>
          </div>

          <div className="preflight-footer">
            <div className="preflight-countdown" aria-live="polite">
              <small>
                {gate === "early" && countdown > 0
                  ? "EXAM OPENS IN"
                  : "EXAM STATUS"}
              </small>
              <strong>
                {gate === "early" && countdown > 0
                  ? formatWaitClock(countdown)
                  : countdown === 0
                    ? "Ready to start"
                    : formatWaitClock(countdown)}
              </strong>
              {exam?.startTime && (
                <span>
                  Scheduled for {new Date(exam.startTime).toLocaleString()}
                </span>
              )}
            </div>
            <div className="preflight-actions">
              <button
                className="primary-button"
                type="button"
                onClick={beginExam}
                disabled={busy || !proctor.ready || countdown > 0}
              >
                {busy
                  ? "Checking exam availability…"
                  : countdown > 0
                    ? "Waiting for exam to open"
                    : !proctor.ready
                      ? "Starting camera check…"
                      : "Start exam →"}
              </button>
              <button
                className="waiting-edit"
                type="button"
                onClick={() => window.location.assign("/student")}
              >
                Back to student dashboard
              </button>
            </div>
          </div>
          {error && <div className="inline-error">{error}</div>}
        </section>
      </main>
    )
  }

  if (screen === "gate")
    return (
      <main className="student-page">
        <section className="student-gate">
          <Brand />
          <span className="student-gate-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="10" width="14" height="11" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
            </svg>
          </span>
          <span className="eyebrow">ASSIGNED EXAM ACCESS</span>
          <h1>Ready to begin?</h1>
          <p>
            This examination is assigned to your student account. Confirm your
            identity below to continue to the camera check.
          </p>
          {gate === "early" && (
            <div className="schedule-banner">
              <span>◷</span>
              <div>
                <strong>Exam has not started yet</strong>
                <small>
                  {countdown
                    ? `Opens in ${formatWaitClock(countdown)}`
                    : "The exam opens shortly. Enter when the timer reaches zero."}
                </small>
              </div>
            </div>
          )}
          {gate === "closed" && (
            <div className="inline-error">
              This examination is closed. Contact your invigilator if you
              believe this is an error.
            </div>
          )}
          <form onSubmit={enter} className="gate-form">
            <div className="preflight-candidate account-candidate">
              <span>{candidateName.trim().slice(0, 1).toUpperCase() || "S"}</span>
              <div><strong>{candidateName}</strong><small>Student ID · {studentProfile?.studentNumber}</small></div>
            </div>
            {error && <div className="inline-error">{error}</div>}
            <button
              className="primary-button wide"
              disabled={busy || !studentProfile}
            >
              {busy ? "Checking assigned exam…" : "Continue to camera check →"}
            </button>
          </form>
          <div className="privacy-note">
            After your assignment is verified, you’ll complete a local camera check
            before the exam. Camera frames stay on this device.
          </div>
        </section>
      </main>
    )
  if (!exam)
    return (
      <main className="student-page">
        <div className="student-gate">
          <Brand />
          <span className="eyebrow">EXAM NOT FOUND</span>
          <h1>This exam link is unavailable</h1>
          <p>Check the link with your invigilator and try again.</p>
        </div>
      </main>
    )

  if (screen === "upload") {
    const photoQuestions = exam.questions.paper2.filter((question) => question.allowPhotoUpload)
    return (
      <main className="student-page student-upload-page">
        <section className="student-upload-card">
          <span className="eyebrow">HANDWRITTEN ANSWER UPLOAD</span>
          <h1>Photograph your written work</h1>
          <p>
            Your timed writing period is over. Camera checks are paused while you photograph and upload the approved answers. Submit before the upload timer ends.
          </p>
          <div className="upload-countdown">
            <span>UPLOAD WINDOW REMAINING</span>
            <strong>{formatClock(uploadSeconds)}</strong>
          </div>
          <form ref={formRef} onSubmit={submit} className="photo-upload-list">
            {photoQuestions.map((question, index) => (
              <article className="photo-upload-question" key={question.id}>
                <div>
                  <span className="eyebrow">QUESTION {index + 1} · {question.marks} MARKS</span>
                  <h2>{question.prompt}</h2>
                </div>
                {photoAnswers[question.id] ? (
                  <div className="photo-preview-wrap">
                    <img src={photoAnswers[question.id]} alt={`Handwritten answer for question ${index + 1}`} />
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={uploadSeconds <= 0 || busy}
                      onClick={() => setPhotoAnswers((current) => {
                        const next = { ...current }
                        delete next[question.id]
                        return next
                      })}
                    >
                      Remove photo
                    </button>
                  </div>
                ) : (
                  <label className="photo-picker">
                    <strong>{photoBusyQuestion === question.id ? "Preparing photo…" : "Take or choose a photo"}</strong>
                    <small>Keep the whole page in focus and make sure your writing is readable.</small>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      disabled={uploadSeconds <= 0 || busy || Boolean(photoBusyQuestion)}
                      onChange={async (event) => {
                        const file = event.currentTarget.files?.[0]
                        event.currentTarget.value = ""
                        if (!file) return
                        setPhotoBusyQuestion(question.id)
                        setError("")
                        try {
                          const image = await compressHandwrittenPhoto(file)
                          setPhotoAnswers((current) => ({ ...current, [question.id]: image }))
                        } catch (cause) {
                          setError(cause instanceof Error ? cause.message : "Could not prepare that image.")
                        } finally {
                          setPhotoBusyQuestion("")
                        }
                      }}
                    />
                  </label>
                )}
              </article>
            ))}
            <div className="upload-camera-note">Camera supervision is paused only for this upload window. Your typed answers remain saved.</div>
            {error && <div className="inline-error" role="alert">{error}</div>}
            <button className="primary-button wide" type="submit" disabled={busy || Boolean(photoBusyQuestion)}>
              {busy ? "Submitting and marking…" : "Submit answers for AI marking"}
            </button>
          </form>
        </section>
      </main>
    )
  }

  const questions =
    screen === "paper2" ? exam.questions.paper2 : exam.questions.paper1
  return (
    <main
      className="student-exam-shell exam-no-select"
      data-mobile-phone={isMobilePhone ? "true" : undefined}
    >
      <header className="student-exam-header">
        <Brand />
        <div className="student-mobile-face-alert">
          <span className="student-mobile-face-preview">
            <video ref={proctor.headerVideoRef} autoPlay muted playsInline />
            <i className={proctor.missingFace ? "is-alert" : ""} />
          </span>
          <span className="student-mobile-face-label">
            {proctor.missingFace
              ? "Face not visible"
              : "Face check"}
          </span>
          <span
            className={
              proctor.missingFace
                ? "student-mobile-notification is-alert"
                : "student-mobile-notification"
            }
            role="img"
            aria-label={
              proctor.missingFace
                ? "No face detected. A reminder beep is sounding."
                : "Face detection is monitoring face presence."
            }
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
            </svg>
            {proctor.missingFace && (
              <b aria-hidden="true">!</b>
            )}
          </span>
        </div>
        <div className="student-exam-subject">
          <strong>{exam.title}</strong>
          <small>{exam.subject} · WASSCE Standard</small>
        </div>
        <div className={remaining < 300 ? "exam-clock urgent" : "exam-clock"}>
          <span>TIME REMAINING</span>
          <strong>{formatClock(remaining)}</strong>
        </div>
        <span className="proctor-badge proctor-active">
          {proctor.active ? "Camera checks on" : "Starting camera checks"}
        </span>
      </header>
      <div className="student-progress">
        <span>EXAMINATION IN PROGRESS</span>
        <div
          role="progressbar"
          aria-label="Exam questions answered"
          aria-valuemin={0}
          aria-valuemax={totalQuestionCount}
          aria-valuenow={answeredQuestionCount}
        >
          <i
            style={{
              width: `${answerProgress}%`,
            }}
          />
        </div>
        <small>
          {answeredQuestionCount} of {totalQuestionCount}{" "}
          questions answered
        </small>
      </div>
      <form ref={formRef} className="exam-workspace" onSubmit={submit}>
        <section className="question-area">
          <div className="question-list">
            {screen === "paper1"
              ? (questions as ObjectiveQuestion[]).map((question, index) => (
                  <article
                    id={`question-${question.id}`}
                    className="student-question"
                    key={question.id}
                  >
                    <span className="question-count">
                      QUESTION {index + 1} <i>{question.marks || 1} mark</i>
                    </span>
                    <h2><ExamText text={question.stem} /></h2>
                    <div className="student-options">
                      {question.options.map((option) => (
                        <label
                          className={
                            answers[question.id] === option.id
                              ? "student-option picked"
                              : "student-option"
                          }
                          key={option.id}
                        >
                          <input
                            type="radio"
                            name={question.id}
                            value={option.id}
                            checked={answers[question.id] === option.id}
                            onChange={() => setAnswer(question.id, option.id)}
                          />
                          <b>{option.label}</b>
                          <span><ExamText text={option.text} /></span>
                          {answers[question.id] === option.id && <i>✓</i>}
                        </label>
                      ))}
                    </div>
                  </article>
                ))
              : (questions as TheoryPart[]).map((question, index) => (
                  <TheoryResponse
                    question={{
                      ...question,
                      label: question.label || String(index + 1),
                    }}
                    answers={answers}
                    setAnswer={setAnswer}
                    key={question.id}
                  />
                ))}
            {!questions.length && (
              <div className="no-questions">
                There are no questions in this paper. Choose the other paper or
                contact your invigilator.
              </div>
            )}
          </div>
          <footer className="exam-submit-bar">
            <span>
              <i /> Answers are saved as you work in this session
            </span>
            {screen === "paper1" && exam.questions.paper2.length > 0 ? (
              <button
                type="button"
                className="primary-button"
                disabled={busy}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  setError("")
                  setScreen("paper2")
                  window.scrollTo(0, 0)
                }}
              >
                Paper 2 · Continue →
              </button>
            ) : (
              <button type="submit" className="primary-button" disabled={busy}>
                {busy ? "Submitting…" : "Submit examination →"}
              </button>
            )}
          </footer>
          {error && <div className="inline-error">{error}</div>}
        </section>
        <aside className="question-nav">
          <div>
            <span className="eyebrow">QUESTION NAVIGATOR</span>
            <h3>{screen === "paper1" ? "Paper 1" : "Paper 2"}</h3>
            <div className="question-nav-grid">
              {(screen === "paper1"
                ? exam.questions.paper1
                : exam.questions.paper2
              ).map((question, index) => (
                <button
                  type="button"
                  className={
                    answers[question.id] ||
                    ("parts" in question &&
                      question.parts?.some((part) => answers[part.id]))
                      ? "answered"
                      : ""
                  }
                  key={question.id}
                  onClick={() =>
                    document
                      .getElementById(`question-${question.id}`)
                      ?.scrollIntoView({ behavior: "smooth", block: "center" })
                  }
                >
                  {index + 1}
                </button>
              ))}
            </div>
          </div>
          <div className="nav-legend">
            <span>
              <i className="answered-dot" />
              Answered
            </span>
            <span>
              <i />
              Unanswered
            </span>
          </div>
          <div className="candidate-card">
            <span>{candidateName.slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{candidateName}</strong>
              <small>{candidateNumber}</small>
            </div>
          </div>
          {proctorOn && (
            <div className="camera-card">
              <video ref={proctor.videoRef} autoPlay muted playsInline />
              <span
                className={
                  proctor.missingFace || proctor.error
                    ? "camera-status warning"
                    : "camera-status"
                }
              >
                <i />
                {proctor.error
                  ? "Camera check needs attention"
                  : proctor.missingFace
                    ? `No face detected · reminder beep · ${Math.ceil(proctor.missingFaceSeconds)}s`
                    : proctor.faceCount === 0
                      ? "No face detected yet"
                      : proctor.active
                        ? "Checking for face presence"
                        : "Starting camera…"}
              </span>
              {proctor.error && <small>{proctor.error}</small>}
            </div>
          )}
        </aside>
      </form>
    </main>
  )
}
