"use client"
// Timer starts once when the candidate enters; changing paper doesn't reset it.
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { FormEvent } from "react"
import { useLocalFaceProctor } from "./hooks/useLocalFaceProctor"
import type { ObjectiveQuestion, TheoryPart } from "./lib/examTypes"

type StudentExamData = {
  id: string
  title: string
  subject: string
  startTime: string
  endTime: string
  durationMinutes: number
  lookAwayWarningSecs: number
  lockoutThresholdSecs: number
  maxWarnings: number
  maxRetries: number
  questions: { paper1: ObjectiveQuestion[]; paper2: TheoryPart[] }
}
type Attempt = {
  id: string
  objectiveScore: number
  objectiveMax: number
  theoryScore?: number
  theoryMax?: number
}
type Screen = "gate" | "preflight" | "paper1" | "paper2" | "submitted" | "locked"

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
    lookAwayWarningSecs: preview.lookAwayWarningSecs ?? 3,
    lockoutThresholdSecs: preview.lockoutThresholdSecs ?? 7,
    maxWarnings: preview.maxWarnings ?? 3,
    maxRetries: preview.maxRetries ?? 0,
    questions: { paper1: [], paper2: [] },
  }
}

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">W</span>
      <span className="brand-type">
        <strong>WASSCE Online</strong>
        <small>Secure examination portal</small>
      </span>
    </div>
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
        <p>{part.prompt}</p>
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
      <h2>{question.prompt}</h2>
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
  const [accessCode, setAccessCode] = useState("")
  const [candidateName, setCandidateName] = useState("")
  const [candidateNumber, setCandidateNumber] = useState("")
  const [exam, setExam] = useState<StudentExamData | null>(null)
  const [screen, setScreen] = useState<Screen>("gate")
  const [gate, setGate] = useState<"early" | "closed" | "">("")
  const [now, setNow] = useState(Date.now())
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [remaining, setRemaining] = useState(0)
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [paper2Pending, setPaper2Pending] = useState(false)
  const [proctorOn, setProctorOn] = useState(false)
  const [warnings, setWarnings] = useState(0)
  const [reshuffleCount, setReshuffleCount] = useState(0)
  const [shuffleSeed, setShuffleSeed] = useState<string | undefined>()
  const answerKey = `wassce-answers-${examId}`
  const formRef = useRef<HTMLFormElement>(null)
  const deadlineAt = useRef(0)
  const liveSession = useRef({
    exam: null as StudentExamData | null,
    accessCode: "",
    candidateName: "",
    candidateNumber: "",
    answers: {} as Record<string, string>,
    warnings: 0,
    reshuffleCount: 0,
    shuffleSeed: undefined as string | undefined,
  })
  liveSession.current = {
    exam,
    accessCode,
    candidateName,
    candidateNumber,
    answers,
    warnings,
    reshuffleCount,
    shuffleSeed,
  }
  const loggedOut = useCallback(
    async (reason: string, currentWarnings: number) => {
      setProctorOn(false)
      setError(reason)
      const current = liveSession.current
      if (current.exam) {
        try {
          await fetch(`/api/student/exams/${examId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "lockout",
              accessCode: current.accessCode,
              candidateName: current.candidateName,
              candidateNumber: current.candidateNumber,
              answers: current.answers,
              warnings: current.warnings + currentWarnings,
              reshuffleCount: current.reshuffleCount,
              shuffleSeed: current.shuffleSeed,
            }),
          })
        } catch {
          // The lock screen still prevents continuing in this browser.
        }
      }
      setScreen("locked")
      sessionStorage.removeItem(answerKey)
    },
    [answerKey, examId],
  )
  const isExamScreen = screen === "paper1" || screen === "paper2"
  const proctor = useLocalFaceProctor({
    enabled: screen === "preflight" || (proctorOn && isExamScreen),
    monitoring: proctorOn && isExamScreen,
    warningThresholdSeconds: exam?.lookAwayWarningSecs,
    lockoutThresholdSeconds: exam?.lockoutThresholdSecs,
    maxWarnings: exam?.maxWarnings,
    onLockout: loggedOut,
  })
  liveSession.current.warnings = warnings

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    if (!exam || !["paper1", "paper2"].includes(screen)) return
    sessionStorage.setItem(
      answerKey,
      JSON.stringify({ answers, candidateNumber, shuffleSeed }),
    )
  }, [answerKey, answers, candidateNumber, exam, screen, shuffleSeed])
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

  const countdown = useMemo(
    () =>
      exam?.startTime
        ? Math.max(0, Math.ceil((Date.parse(exam.startTime) - now) / 1000))
        : 0,
    [exam?.startTime, now],
  )

  async function enter(event?: FormEvent) {
    event?.preventDefault()
    setBusy(true)
    setError("")
    try {
      const response = await fetch(`/api/student/exams/${examId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "enter",
          accessCode: accessCode.trim(),
          candidateName,
          candidateNumber,
        }),
      })
      const body = await response.json()
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
      setShuffleSeed(body.shuffleSeed)
      setReshuffleCount(body.reshuffleCount || 0)
      const saved = !body.shuffleSeed ? sessionStorage.getItem(answerKey) : null
      const savedAttempt = saved
        ? JSON.parse(saved) as {
            answers?: Record<string, string>
            candidateNumber?: string
            shuffleSeed?: string
          }
        : null
      setAnswers(
        savedAttempt?.candidateNumber === candidateNumber &&
          !savedAttempt.shuffleSeed
          ? savedAttempt.answers || {}
          : {},
      )
      setWarnings(0)
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
    if (!proctor.ready) {
      setError(
        "Complete the camera check before starting. If the camera cannot detect you, ask the invigilator for help.",
      )
      return
    }
    setBusy(true)
    setError("")
    try {
      const response = await fetch(`/api/student/exams/${examId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "enter",
          accessCode: accessCode.trim(),
          candidateName,
          candidateNumber,
        }),
      })
      const body = await response.json()
      if (body.gate === "early") {
        setGate("early")
        if (body.startTime)
          setExam((current) => current || createExamPreview(examId, body))
        return
      }
      if (body.gate === "closed") {
        setGate("closed")
        setScreen("gate")
        setError("This examination has closed. Contact your invigilator.")
        return
      }
      if (!response.ok)
        throw new Error(body.error || "Unable to start this exam.")
      setExam(body.exam)
      setGate("")
      setShuffleSeed(body.shuffleSeed)
      setReshuffleCount(body.reshuffleCount || 0)
      setWarnings(0)
      proctor.reset()
      setProctorOn(true)
      const allotted = Number(body.exam.durationMinutes || 60) * 60
      setRemaining(allotted)
      deadlineAt.current = Math.min(
        Date.now() + allotted * 1000,
        Date.parse(body.exam.endTime),
      )
      setScreen("paper1")
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to start this exam.",
      )
    } finally {
      setBusy(false)
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!exam || busy || screen === "submitted") return
    setBusy(true)
    setError("")
    setProctorOn(false)
    try {
      const response = await fetch(`/api/student/exams/${examId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit",
          accessCode,
          candidateName,
          candidateNumber,
          answers,
          warnings: proctor.warningCount + warnings,
          reshuffleCount,
          shuffleSeed,
        }),
      })
      const body = await response.json()
      if (!response.ok)
        throw new Error(body.error || "Could not submit your answers.")
      setAttempt(body.attempt)
      setPaper2Pending(body.paper2Pending)
      setScreen("submitted")
      sessionStorage.removeItem(answerKey)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not submit your answers.",
      )
    } finally {
      setBusy(false)
    }
  }

  const setAnswer = (id: string, value: string) =>
    setAnswers((current) => ({ ...current, [id]: value }))

  if (screen === "submitted")
    return (
      <main className="student-page">
        <section className="student-result">
          <span className="result-check">✓</span>
          <span className="eyebrow">SUBMISSION RECEIVED</span>
          <h1>Exam submitted</h1>
          <p>Your responses have been saved. You may now close this page.</p>
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
          {paper2Pending && (
            <div className="pending-banner">
              Theory responses are saved and waiting for AI grading. Your
              teacher will see the updated report when grading is available.
            </div>
          )}
          <small className="receipt-id">
            SUBMISSION ID · {attempt?.id.slice(0, 8).toUpperCase()}
          </small>
        </section>
      </main>
    )

  if (screen === "locked")
    return (
      <main className="student-page">
        <section className="student-gate locked-gate">
          <span className="lock-mark">⌑</span>
          <span className="eyebrow danger-text">ANTI-CHEAT SESSION LOCKED</span>
          <h1>Session locked</h1>
          <p>
            {error ||
              "The proctoring limit was reached. Re-enter your access code to continue."}
          </p>
          <div className="lock-info">
            <strong>Questions will be reshuffled on re-entry.</strong>
            <small>
              Attempts remaining are enforced for this candidate number.
            </small>
          </div>
          <form onSubmit={enter} className="gate-form">
            <label>
              Six-character access code
              <input
                value={accessCode}
                onChange={(event) =>
                  setAccessCode(
                    event.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9]/g, "")
                      .slice(0, 6),
                  )
                }
                autoComplete="off"
              />
            </label>
            <button
              className="primary-button wide"
              disabled={busy || accessCode.length !== 6}
            >
              {busy ? "Checking…" : "Re-enter exam →"}
            </button>
          </form>
          {error && <div className="inline-error">{error}</div>}
        </section>
      </main>
    )

  if (screen === "preflight") {
    const warningSeconds = exam?.lookAwayWarningSecs ?? 3
    const lockoutSeconds = exam?.lockoutThresholdSecs ?? 7
    const warningLimit = exam?.maxWarnings ?? 3
    const cameraStatus = proctor.error
      ? "Camera check needs attention"
      : !proctor.active
        ? "Starting camera and face check…"
        : proctor.faceCount === null
          ? "Camera is on; checking your face…"
          : proctor.faceCount === 0
            ? "No face detected. Move into the frame."
            : proctor.faceCount > 1
              ? "More than one face detected. Make sure only you are visible."
              : !proctor.centered
                ? "Move your face to the center of the frame."
                : proctor.lookingAway
                  ? "Face found. Look at the screen and center yourself."
                  : "Camera check passed — you are ready."
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
              <span className="eyebrow">HOW TO AVOID CAMERA WARNINGS</span>
              <h2>Stay visible and face the screen</h2>
              <ol>
                <li>Allow camera access and keep the preview visible.</li>
                <li>
                  Sit in a well-lit place with your face centered in the frame.
                </li>
                <li>
                  Make sure only you are visible; keep your face uncovered.
                </li>
                <li>
                  Keep your attention on the screen and avoid leaving the camera
                  view.
                </li>
              </ol>
              <div className="preflight-warning-note">
                <strong>Brief movement is okay.</strong>
                <p>
                  Warnings start after {warningSeconds} seconds without one
                  centered face. Staying out of position for {lockoutSeconds}
                  seconds or reaching {warningLimit} warnings can lock the
                  attempt. If your camera or lighting causes problems, tell the
                  invigilator before starting.
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
                      ? "Complete camera check to continue"
                      : "Start exam →"}
              </button>
              <button
                className="waiting-edit"
                type="button"
                onClick={() => {
                  setScreen("gate")
                  setGate("")
                  setError("")
                }}
              >
                Change candidate details
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
          <span className="student-gate-icon">⌑</span>
          <span className="eyebrow">CANDIDATE EXAM ACCESS</span>
          <h1>Ready to begin?</h1>
          <p>
            Enter your candidate details and the six-character access code
            provided by your invigilator.
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
            <label>
              Candidate full name
              <input
                value={candidateName}
                onChange={(event) => {
                  setCandidateName(event.target.value)
                  setGate("")
                }}
                placeholder="Enter your name"
                required
              />
            </label>
            <label>
              Candidate number
              <input
                value={candidateNumber}
                onChange={(event) => {
                  setCandidateNumber(event.target.value)
                  setGate("")
                }}
                placeholder="e.g. 0240184921"
                required
              />
            </label>
            <label>
              Six-character access code
              <input
                className="code-input"
                value={accessCode}
                onChange={(event) => {
                  setAccessCode(
                    event.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9]/g, "")
                      .slice(0, 6),
                  )
                  setGate("")
                }}
                placeholder="A1B2C3"
                autoComplete="off"
                required
              />
            </label>
            {error && <div className="inline-error">{error}</div>}
            <button
              className="primary-button wide"
              disabled={busy || accessCode.length !== 6}
            >
              {busy ? "Verifying access…" : "Verify & enter exam →"}
            </button>
          </form>
          <div className="privacy-note">
            ⌑ After access is verified, you’ll complete a local camera check
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

  const questions =
    screen === "paper2" ? exam.questions.paper2 : exam.questions.paper1
  return (
    <main className="student-exam-shell">
      <header className="student-exam-header">
        <Brand />
        <div className="student-exam-subject">
          <strong>{exam.title}</strong>
          <small>{exam.subject} · WASSCE Standard</small>
        </div>
        <div className={remaining < 300 ? "exam-clock urgent" : "exam-clock"}>
          <span>TIME REMAINING</span>
          <strong>{formatClock(remaining)}</strong>
        </div>
        <span className="proctor-badge proctor-active">
          {proctor.active
            ? "◉ Local camera checks on"
            : "◉ Starting camera checks"}
        </span>
      </header>
      <div className="student-progress">
        <span>EXAMINATION IN PROGRESS</span>
        <div>
          <i
            style={{
              width: `${Math.max(0, Math.min(100, (Object.keys(answers).length / Math.max(1, exam.questions.paper1.length + exam.questions.paper2.length)) * 100))}%`,
            }}
          />
        </div>
        <small>
          {Object.keys(answers).length} of{" "}
          {exam.questions.paper1.length + exam.questions.paper2.length}{" "}
          questions answered
        </small>
      </div>
      <form ref={formRef} className="exam-workspace" onSubmit={submit}>
        <section className="question-area">
          <div className="paper-tabs">
            <button
              type="button"
              className={screen === "paper1" ? "paper-tab active" : "paper-tab"}
              onClick={() => setScreen("paper1")}
            >
              Paper 1 <small>Objectives · {exam.questions.paper1.length}</small>
            </button>
            <button
              type="button"
              className={screen === "paper2" ? "paper-tab active" : "paper-tab"}
              onClick={() => setScreen("paper2")}
            >
              Paper 2 <small>Theory · {exam.questions.paper2.length}</small>
            </button>
          </div>
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
                    <h2>{question.stem}</h2>
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
                          <span>{option.text}</span>
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
            <button type="submit" className="primary-button" disabled={busy}>
              {busy ? "Submitting…" : "Submit examination →"}
            </button>
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
                  proctor.warning || proctor.error
                    ? "camera-status warning"
                    : "camera-status"
                }
              >
                <i />
                {proctor.warning
                  ? `Look at the screen · ${Math.ceil(proctor.awaySeconds)}s`
                  : proctor.error
                    ? "Camera check needs attention"
                    : proctor.faceCount === 0
                      ? "No face detected"
                      : proctor.faceCount !== null && proctor.faceCount > 1
                        ? "More than one face"
                        : proctor.faceCount === 1 && !proctor.centered
                          ? "Center your face in frame"
                          : proctor.active
                            ? "Local camera check active"
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
