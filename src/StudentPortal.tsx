"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { FormEvent } from "react"
import type { StudentClass, StudentExamAssignment, StudentProfile } from "./lib/studentTypes"

type Dashboard = { student: StudentProfile; exams: StudentExamAssignment[] }
type PortalMode = "login" | "register"
type DashboardView = "exams" | "history"

function gradeTone(grade?: string) {
  const letter = grade?.trim().toUpperCase().match(/^([A-F])(?:\d|$)/)?.[1]
  if (letter === "A" || letter === "B") return "high"
  if (letter === "C" || letter === "D") return "middle"
  if (letter === "E" || letter === "F") return "low"
  return "pending"
}

function gradeAdvice(grade?: string) {
  const tone = gradeTone(grade)
  if (grade?.trim().toUpperCase().startsWith("A"))
    return "Excellent work. Keep practising to maintain this standard."
  if (tone === "high") return "Strong result. Review missed questions to reach the top grade band."
  if (tone === "middle") return "Good progress. Review missed topics and practise them before your next test."
  if (tone === "low") return "Revisit the core topics and ask your teacher for support."
  return "Your final grade will be shown when marking is complete."
}

function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export default function StudentPortal() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const [mode, setMode] = useState<PortalMode>("login")
  const [classes, setClasses] = useState<StudentClass[]>([])
  const [view, setView] = useState<DashboardView>("exams")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [studentNumber, setStudentNumber] = useState("")
  const [password, setPassword] = useState("")
  const [remember, setRemember] = useState(true)
  const [fullName, setFullName] = useState("")
  const [waecCandidateNumber, setWaecCandidateNumber] = useState("")
  const [classId, setClassId] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")

  const loadDashboard = useCallback(async () => {
    const response = await fetch("/api/student-auth/dashboard", { cache: "no-store" })
    const body = await response.json()
    if (response.status === 401) {
      setDashboard(null)
      return false
    }
    if (!response.ok) throw new Error(body.error || "Could not load your student dashboard.")
    setDashboard(body as Dashboard)
    return true
  }, [])

  useEffect(() => {
    let mounted = true
    fetch("/api/student-auth/dashboard", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json()
        if (!mounted) return
        if (response.ok) setDashboard(body as Dashboard)
        else if (response.status !== 401) setError(body.error || "Could not load your dashboard.")
      })
      .catch(() => {
        if (mounted) setError("Could not connect to the student portal. Try again.")
      })
      .finally(() => {
        if (mounted) setCheckingSession(false)
      })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    let mounted = true
    fetch("/api/student-auth/classes", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json()
        if (mounted && response.ok) setClasses(body.classes as StudentClass[])
      })
      .catch(() => {})
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (!dashboard) return
    const timer = window.setInterval(() => {
      void loadDashboard().catch(() => {})
    }, 30000)
    return () => window.clearInterval(timer)
  }, [dashboard, loadDashboard])

  const activeExams = useMemo(
    () => dashboard?.exams.filter((exam) => ["upcoming", "ready", "in-progress"].includes(exam.status)) || [],
    [dashboard],
  )
  const historyExams = useMemo(
    () => dashboard?.exams.filter((exam) => !["upcoming", "ready", "in-progress"].includes(exam.status)) || [],
    [dashboard],
  )
  const currentList = view === "exams"
    ? activeExams
    : [...historyExams].sort((left, right) => Date.parse(right.startTime) - Date.parse(left.startTime))

  function openNextPage() {
    const next = new URLSearchParams(window.location.search).get("next")
    if (next?.startsWith("/exam/") && !next.startsWith("//")) {
      window.location.assign(next)
      return true
    }
    return false
  }

  async function signIn(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError("")
    setNotice("")
    try {
      const response = await fetch("/api/student-auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentNumber, password, remember }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Could not sign in.")
      setPassword("")
      if (!body.student?.mustChangePassword && openNextPage()) return
      await loadDashboard()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in.")
    } finally {
      setBusy(false)
    }
  }

  async function register(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError("")
    setNotice("")
    if (password !== confirmPassword) {
      setError("The passwords do not match.")
      setBusy(false)
      return
    }
    try {
      const response = await fetch("/api/student-auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, studentNumber, waecCandidateNumber, classId, password }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Could not submit registration.")
      setPassword("")
      setConfirmPassword("")
      setMode("login")
      setNotice(body.message || "Registration submitted. Wait for teacher approval before signing in.")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not submit registration.")
    } finally {
      setBusy(false)
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError("")
    setNotice("")
    if (newPassword.length < 8) {
      setError("Choose a password with at least 8 characters.")
      setBusy(false)
      return
    }
    try {
      const response = await fetch("/api/student-auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Could not change password.")
      setNewPassword("")
      setNotice("Your password has been updated.")
      await loadDashboard()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not change password.")
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    await fetch("/api/student-auth/logout", { method: "POST" })
    setDashboard(null)
    setMode("login")
    setNotice("You have signed out.")
  }

  if (checkingSession)
    return <main className="student-portal-page"><div className="portal-loading"><span className="loading-mark">W</span><span>Loading student portal…</span></div></main>

  if (!dashboard) {
    return (
      <main className="student-portal-page student-auth-page">
        <section className="student-auth-card">
          <a className="student-brand" href="/" aria-label="Virtual Exam teacher portal">
            <span className="brand-mark">W</span><span><strong>Virtual Exam</strong><small>Student portal</small></span>
          </a>
          <span className="eyebrow">STUDENT ACCOUNT</span>
          <h1>{mode === "login" ? "Sign in to your exams" : "Request a student account"}</h1>
          <p>{mode === "login" ? "Use your school Student ID and password. No email is needed." : "Submit your school details. Your teacher will approve the account before you can sign in."}</p>
          {notice && <div className="student-notice" role="status">{notice}</div>}
          {mode === "login" ? (
            <form className="student-auth-form" onSubmit={signIn}>
              <label>School Student ID<input autoComplete="username" value={studentNumber} onChange={(event) => setStudentNumber(event.target.value)} placeholder="e.g. STU-02418" required /></label>
              <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your password" required /></label>
              <label className="remember-device"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /><span><strong>Remember me on this device</strong><small>Uncheck this on a shared school computer.</small></span></label>
              {error && <div className="inline-error" role="alert">{error}</div>}
              <button className="primary-button wide" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
              <button className="student-mode-switch" type="button" onClick={() => { setMode("register"); setError(""); setNotice("") }}>New student? Request an account</button>
            </form>
          ) : (
            <form className="student-auth-form" onSubmit={register}>
              <label>Full name<input autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Name as registered at school" required /></label>
              <label>School Student ID<input autoComplete="username" value={studentNumber} onChange={(event) => setStudentNumber(event.target.value)} placeholder="Your admission or student ID" required /></label>
              <label>Class or form<select value={classId} onChange={(event) => setClassId(event.target.value)} required disabled={!classes.length}><option value="">{classes.length ? "Select your class" : "No classes available"}</option>{classes.map((studentClass) => <option key={studentClass.id} value={studentClass.id}>{studentClass.name}</option>)}</select></label>
              <label>WAEC candidate number <span className="optional-label">Optional</span><input value={waecCandidateNumber} onChange={(event) => setWaecCandidateNumber(event.target.value)} placeholder="If already assigned" /></label>
              <label>Create password<input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" required /></label>
              <label>Confirm password<input type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Enter it again" required /></label>
              {error && <div className="inline-error" role="alert">{error}</div>}
              {!classes.length && <div className="student-notice" role="status">Your school has not added any classes yet. Contact the admin to create your class before registering.</div>}
              <button className="primary-button wide" disabled={busy || !classes.length}>{busy ? "Submitting…" : "Submit registration"}</button>
              <button className="student-mode-switch" type="button" onClick={() => { setMode("login"); setError(""); setNotice("") }}>Already registered? Sign in</button>
            </form>
          )}
          <div className="student-auth-foot">If you have forgotten your password, ask your teacher for a reset.</div>
        </section>
      </main>
    )
  }

  const { student, exams } = dashboard
  const needsPasswordChange = student.mustChangePassword
  const readyCount = exams.filter((exam) => exam.status === "ready").length
  const upcomingCount = exams.filter((exam) => exam.status === "upcoming").length
  const resultCount = exams.filter((exam) => exam.status === "submitted" || exam.status === "graded").length

  return (
    <main className="student-portal-page">
      <header className="student-portal-header">
        <a className="student-brand" href="/student"><span className="brand-mark">W</span><span><strong>Virtual Exam</strong><small>Student portal</small></span></a>
        <div className="student-portal-user"><span className="student-admin-avatar">{student.fullName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span><span><strong>{student.fullName}</strong><small>{student.studentNumber} · {student.className}</small></span><button className="secondary-button" onClick={() => void signOut()}>Sign out</button></div>
      </header>
      <div className="student-portal-content">
        {needsPasswordChange ? (
          <section className="student-password-card">
            <span className="eyebrow">SECURITY UPDATE REQUIRED</span>
            <h1>Choose a new password</h1>
            <p>Your teacher gave you a temporary password. Set a password only you know to continue.</p>
            <form className="student-auth-form" onSubmit={changePassword}>
              <label>New password<input type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></label>
              {error && <div className="inline-error" role="alert">{error}</div>}
              {notice && <div className="student-notice" role="status">{notice}</div>}
              <button className="primary-button" disabled={busy}>{busy ? "Updating…" : "Save new password"}</button>
            </form>
          </section>
        ) : (
          <>
            <div className="student-dashboard-heading">
              <div><span className="eyebrow">YOUR EXAM SCHEDULE</span><h1>Welcome, {student.fullName.split(/\s+/)[0]}</h1><p>Exams assigned to you and results from your previous attempts.</p></div>
            </div>
            {notice && <div className="student-notice" role="status">{notice}</div>}
            <section className="student-summary-grid">
              <article><small>Ready now</small><strong>{readyCount}</strong><span>Assigned exams you can start</span></article>
              <article><small>Upcoming</small><strong>{upcomingCount}</strong><span>Scheduled for a later time</span></article>
              <article><small>Results</small><strong>{resultCount}</strong><span>Submitted exam records</span></article>
            </section>
            <section className="student-dashboard-panel">
              <div className="student-list-heading"><div><h2>{view === "exams" ? "My examinations" : "Results and past exams"}</h2><p>{view === "exams" ? "Your upcoming and active assignments." : "Submitted results, expired assignments, and locked attempts."}</p></div><div className="student-list-tabs"><button className={view === "exams" ? "active" : ""} onClick={() => setView("exams")}>Exams <span>{activeExams.length}</span></button><button className={view === "history" ? "active" : ""} onClick={() => setView("history")}>History <span>{historyExams.length}</span></button></div></div>
              {currentList.length ? (
                <div className="student-exam-cards">
                  {currentList.map((exam) => {
                    const hasResult = exam.status === "submitted" || exam.status === "graded"
                    const statusLabel = exam.status === "in-progress" ? "In progress" : exam.status === "ready" ? "Ready to start" : exam.status === "upcoming" ? "Upcoming" : exam.status === "expired" ? "Expired" : exam.status === "locked" ? "Locked" : exam.paper2Pending ? "Marking pending" : "Result available"
                    return (
                      <article className="student-exam-card" key={exam.id}>
                        <div className="student-exam-card-main"><span className={`student-exam-status status-${exam.status}`}>{statusLabel}</span><h3>{exam.title}</h3><p>{exam.subject} · {exam.durationMinutes} minutes</p><small>{exam.status === "expired" ? `Closed ${formatDate(exam.endTime)}` : `Starts ${formatDate(exam.startTime)}`}</small>
                          {hasResult && exam.attempt && <div className="student-result-summary"><span>Score <strong>{exam.attempt.objectiveScore + (exam.attempt.theoryScore || 0)} / {exam.attempt.objectiveMax + (exam.attempt.theoryMax || 0)}</strong></span>{exam.attempt.grade && <span className={`student-grade grade-${gradeTone(exam.attempt.grade)}`}>Grade {exam.attempt.grade}</span>}{exam.paper2Pending && <small>Paper 2 is still being marked; this result can change.</small>}{exam.attempt.grade && !exam.paper2Pending && <small>{gradeAdvice(exam.attempt.grade)}</small>}{exam.attempt.teacherReviewed && <small>Teacher review complete</small>}</div>}
                        </div>
                        <div className="student-exam-card-action">
                          {(exam.status === "ready" || exam.status === "in-progress") ? <a className="primary-button" href={`/exam/${exam.id}`}>{exam.status === "ready" ? "View instructions" : "Resume exam"}</a> : hasResult ? <span className="student-card-note">Saved to your history</span> : exam.status === "upcoming" ? <span className="student-card-note">Available at the scheduled time</span> : <span className="student-card-note">Contact your teacher for help</span>}
                        </div>
                      </article>
                    )
                  })}
                </div>
              ) : <div className="student-dashboard-empty"><strong>{view === "exams" ? "No upcoming exams assigned" : "No past exams yet"}</strong><p>{view === "exams" ? "Your teacher will add exams to your account when they are ready." : "Submitted results and expired assignments will appear here."}</p></div>}
            </section>
          </>
        )}
      </div>
    </main>
  )
}
