"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { FormEvent } from "react"
import type { ObjectiveQuestion, TheoryPart } from "./lib/examTypes"
import type { ExamAttempt, PortalExam } from "./lib/portalTypes"

type View = "overview" | "exams" | "results" | "settings"
type Parsed = {
  paper1: ObjectiveQuestion[]
  paper2: TheoryPart[]
  source?: string
}

const navItems: { id: View; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "⌂" },
  { id: "exams", label: "Examinations", icon: "▤" },
  { id: "results", label: "Results", icon: "▥" },
  { id: "settings", label: "Settings", icon: "⚙" },
]

function dateInput(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16)
}

function examState(exam: PortalExam) {
  const now = Date.now()
  if (now < Date.parse(exam.startTime)) return "Scheduled"
  if (now > Date.parse(exam.endTime)) return "Closed"
  return "Live"
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

export default function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [exams, setExams] = useState<PortalExam[]>([])
  const [view, setView] = useState<View>("overview")
  const [showCreate, setShowCreate] = useState(false)
  const [detailsExam, setDetailsExam] = useState<PortalExam | null>(null)
  const [password, setPassword] = useState("")
  const [loginError, setLoginError] = useState("")
  const [toast, setToast] = useState("")
  const [loading, setLoading] = useState(false)

  const loadExams = useCallback(async () => {
    const response = await fetch("/api/exams", { cache: "no-store" })
    if (response.status === 401) {
      setAuthenticated(false)
      return
    }
    if (!response.ok) throw new Error("Could not load exams")
    const body = (await response.json()) as { exams: PortalExam[] }
    setExams(body.exams)
    setAuthenticated(true)
  }, [])

  useEffect(() => {
    let alive = true
    fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => response.json())
      .then(async (data: { authenticated: boolean }) => {
        if (!alive) return
        if (!data.authenticated) {
          setAuthenticated(false)
          return
        }
        await loadExams()
      })
      .catch(() => {
        if (alive) setAuthenticated(false)
      })
    return () => {
      alive = false
    }
  }, [loadExams])

  useEffect(() => {
    if (!authenticated) return
    const timer = window.setInterval(() => {
      void loadExams().catch(() => {})
    }, 15_000)
    return () => window.clearInterval(timer)
  }, [authenticated, loadExams])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(""), 2800)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const stats = useMemo(
    () => ({
      exams: exams.length,
      live: exams.filter((exam) => examState(exam) === "Live").length,
      candidates: exams.reduce(
        (total, exam) => total + exam.attempts.length,
        0,
      ),
      graded: exams
        .flatMap((exam) => exam.attempts)
        .filter((attempt) => attempt.status === "graded").length,
    }),
    [exams],
  )

  async function signIn(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setLoginError("")
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Sign in failed")
      setPassword("")
      await loadExams()
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Sign in failed")
    } finally {
      setLoading(false)
    }
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" })
    setAuthenticated(false)
    setExams([])
  }

  async function saveNewExam(exam: PortalExam) {
    const response = await fetch("/api/exams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(exam),
    })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error || "Could not save exam")
    const createdExam = body.exam as PortalExam
    await loadExams()
    setShowCreate(false)
    setView("exams")
    setDetailsExam(createdExam)
    setToast("Exam created. Share the link and access code with candidates.")
  }

  if (authenticated === null)
    return (
      <div className="portal-loading">
        <span className="loading-mark">W</span>
        <span>Loading teacher portal…</span>
      </div>
    )
  if (!authenticated)
    return (
      <main className="login-screen">
        <section className="login-hero">
          <Brand />
          <div className="hero-copy">
            <span className="eyebrow">SECURE EXAMINATION MANAGEMENT</span>
            <h1>
              Examinations,
              <br />
              <em>with confidence.</em>
            </h1>
            <p>
              Create WASSCE-standard assessments, supervise candidates, and
              review results from one workspace.
            </p>
            <div className="hero-points">
              <span>✓ AI assisted question parsing</span>
              <span>✓ Timed, access-code protected exams</span>
              <span>✓ Objective and theory results</span>
            </div>
          </div>
          <small className="hero-foot">WASSCE ONLINE · TEACHER PORTAL</small>
        </section>
        <section className="login-panel">
          <form className="login-card" onSubmit={signIn}>
            <span className="eyebrow">TEACHER ACCESS</span>
            <h2>Welcome back</h2>
            <p>Sign in to manage your examinations.</p>
            <label htmlFor="teacher-password">Portal password</label>
            <input
              id="teacher-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              required
            />
            <button className="primary-button wide" disabled={loading}>
              {loading ? "Signing in…" : "Sign in to portal"}
              <span>→</span>
            </button>
            {loginError && (
              <div className="inline-error" role="alert">
                {loginError}
              </div>
            )}
            <div className="login-note">
              <span>♧</span>
              <p>
                Your session is protected with an HTTP-only cookie and expires
                after 8 hours.
              </p>
            </div>
          </form>
        </section>
      </main>
    )

  return (
    <div className="portal-shell">
      <aside className="sidebar">
        <Brand />
        <div className="nav-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Teacher workspace">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={view === item.id ? "nav-item active" : "nav-item"}
              onClick={() => setView(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
              {item.id === "exams" && exams.length > 0 && (
                <span className="nav-count">{exams.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="support-card">
            <span className="support-icon">✦</span>
            <strong>Need a hand?</strong>
            <p>Build a reliable exam in just a few steps.</p>
            <button onClick={() => setShowCreate(true)}>
              Create an exam <span>→</span>
            </button>
          </div>
          <div className="user-row">
            <span className="teacher-avatar">TA</span>
            <div>
              <strong>Teacher Admin</strong>
              <small>Exam coordinator</small>
            </div>
            <button title="Sign out" onClick={signOut}>
              ↗
            </button>
          </div>
        </div>
      </aside>
      <main className="portal-main">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Workspace</span>
            <b>/</b>
            <strong>{navItems.find((item) => item.id === view)?.label}</strong>
          </div>
          <div className="top-actions">
            <span className="secure-pill">
              <i /> Secure environment
            </span>
            <button className="avatar-small" title="Sign out" onClick={signOut}>
              TA
            </button>
          </div>
        </header>
        <div className="page-content">
          {view === "overview" && (
            <Overview
              exams={exams}
              stats={stats}
              onCreate={() => setShowCreate(true)}
              onView={setView}
              onToast={setToast}
              onDetails={setDetailsExam}
            />
          )}
          {view === "exams" && (
            <ExamsPage
              exams={exams}
              onCreate={() => setShowCreate(true)}
              onToast={setToast}
              onDetails={setDetailsExam}
            />
          )}
          {view === "results" && <ResultsPage exams={exams} />}
          {view === "settings" && <SettingsPage onToast={setToast} />}
        </div>
      </main>
      {showCreate && (
        <CreateExamModal
          onClose={() => setShowCreate(false)}
          onSave={saveNewExam}
        />
      )}
      {detailsExam && (
        <ExamDetailsModal
          exam={detailsExam}
          onClose={() => setDetailsExam(null)}
          onToast={setToast}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          ✓ <span>{toast}</span>
          <button onClick={() => setToast("")}>×</button>
        </div>
      )}
    </div>
  )
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

function Overview({
  exams,
  stats,
  onCreate,
  onView,
  onToast,
  onDetails,
}: {
  exams: PortalExam[]
  stats: { exams: number; live: number; candidates: number; graded: number }
  onCreate: () => void
  onView: (view: View) => void
  onToast: (message: string) => void
  onDetails: (exam: PortalExam) => void
}) {
  const recent = [...exams]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5)
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {new Intl.DateTimeFormat("en", {
              weekday: "long",
              day: "2-digit",
              month: "long",
              year: "numeric",
            })
              .format(new Date())
              .toUpperCase()}
          </span>
          <h1>
            Good day, Teacher <span>✦</span>
          </h1>
          <p>Here’s the latest activity across your examination workspace.</p>
        </div>
        <button className="primary-button" onClick={onCreate}>
          <span>＋</span> Create examination
        </button>
      </div>
      <section className="metric-grid">
        <Metric
          label="Total examinations"
          value={stats.exams}
          foot="Created in this workspace"
          icon="▤"
          tint="blue"
        />
        <Metric
          label="Live right now"
          value={stats.live}
          foot={stats.live ? "Candidates can enter" : "No active sessions"}
          icon="◉"
          tint="green"
        />
        <Metric
          label="Candidate attempts"
          value={stats.candidates}
          foot="Across all examinations"
          icon="♧"
          tint="purple"
        />
        <Metric
          label="Graded submissions"
          value={stats.graded}
          foot="Objective + theory"
          icon="✓"
          tint="amber"
        />
      </section>
      <section className="dashboard-grid">
        <div className="panel recent-panel">
          <div className="panel-head">
            <div>
              <h2>Recent examinations</h2>
              <p>Manage schedules and candidate access.</p>
            </div>
            <button className="text-button" onClick={() => onView("exams")}>
              View all <span>→</span>
            </button>
          </div>
          {recent.length ? (
            <ExamTable exams={recent} onToast={onToast} onDetails={onDetails} />
          ) : (
            <EmptyExams onCreate={onCreate} />
          )}
        </div>
        <div className="panel quick-panel">
          <div className="panel-head">
            <div>
              <h2>Quick actions</h2>
              <p>Common tasks, ready when you are.</p>
            </div>
          </div>
          <button className="quick-action" onClick={onCreate}>
            <span className="quick-icon qi-blue">＋</span>
            <span>
              <strong>Create an examination</strong>
              <small>Set questions, schedule and access</small>
            </span>
            <b>→</b>
          </button>
          <button className="quick-action" onClick={() => onView("results")}>
            <span className="quick-icon qi-green">▥</span>
            <span>
              <strong>Review results</strong>
              <small>Scores and candidate submissions</small>
            </span>
            <b>→</b>
          </button>
          <div className="proctor-note">
            <span>◉</span>
            <div>
              <strong>Local camera checks are ready</strong>
              <p>
                Students do not need an API key or external face-tracking
                service.
              </p>
            </div>
          </div>
        </div>
      </section>
      <div className="bottom-hint">
        <span>✦</span> <strong>WASSCE standard, built in.</strong> Questions can
        be reviewed and answer keys confirmed before an exam is published.
      </div>
    </>
  )
}

function Metric({
  label,
  value,
  foot,
  icon,
  tint,
}: {
  label: string
  value: number
  foot: string
  icon: string
  tint: string
}) {
  return (
    <article className="metric-card">
      <div className="metric-top">
        <span>{label}</span>
        <i className={`metric-icon ${tint}`}>{icon}</i>
      </div>
      <strong className="metric-value">{value}</strong>
      <small>{foot}</small>
    </article>
  )
}

function ExamTable({
  exams,
  onToast,
  onDetails,
}: {
  exams: PortalExam[]
  onToast: (message: string) => void
  onDetails: (exam: PortalExam) => void
}) {
  return (
    <div className="table-wrap">
      <table className="exam-table">
        <thead>
          <tr>
            <th>EXAMINATION</th>
            <th>SCHEDULE</th>
            <th>STATUS</th>
            <th>ATTEMPTS</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {exams.map((exam) => (
            <tr key={exam.id}>
              <td>
                <span className="subject-avatar">
                  {initials(exam.subject || exam.title)}
                </span>
                <span className="exam-name">
                  <strong>{exam.title}</strong>
                  <small>
                    {exam.subject} ·{" "}
                    {exam.questions.paper1.length +
                      exam.questions.paper2.length}{" "}
                    questions
                  </small>
                </span>
              </td>
              <td>
                <strong>{new Date(exam.startTime).toLocaleDateString()}</strong>
                <small className="td-sub">
                  {new Date(exam.startTime).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  · {exam.durationMinutes} min
                </small>
              </td>
              <td>
                <Status state={examState(exam)} />
              </td>
              <td>
                <span className="attempt-count">{exam.attempts.length}</span>
              </td>
              <td>
                <div className="row-actions">
                  <button
                    title="Exam details"
                    className="exam-info-button"
                    aria-label={`Details for ${exam.title}`}
                    onClick={() => onDetails(exam)}
                  >
                    i
                  </button>
                  <button
                    title="Copy student link"
                    onClick={() => void copyStudentLink(exam, onToast)}
                  >
                    ↗
                  </button>
                  <button
                    title="Open student exam"
                    onClick={() =>
                      window.open(
                        `/exam/${exam.id}`,
                        "_blank",
                        "noopener,noreferrer",
                      )
                    }
                  >
                    ↗
                  </button>
                  <button
                    title="Delete examination"
                    onClick={async () => {
                      if (
                        !window.confirm(
                          `Delete “${exam.title}” and its submissions?`,
                        )
                      )
                        return
                      const response = await fetch(`/api/exams/${exam.id}`, {
                        method: "DELETE",
                      })
                      if (response.ok) window.location.reload()
                      else onToast("Could not delete this examination.")
                    }}
                  >
                    ×
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Status({ state }: { state: string }) {
  return (
    <span className={`status status-${state.toLowerCase()}`}>
      <i />
      {state}
    </span>
  )
}

async function copyStudentLink(
  exam: PortalExam,
  onToast: (message: string) => void,
) {
  try {
    await navigator.clipboard.writeText(
      `${window.location.origin}/exam/${exam.id}`,
    )
    onToast(`Student link copied. Access code: ${exam.accessCode}`)
  } catch {
    window.prompt(
      `Copy this link. Student access code: ${exam.accessCode}`,
      `${window.location.origin}/exam/${exam.id}`,
    )
  }
}

function ExamDetailsModal({
  exam,
  onClose,
  onToast,
}: {
  exam: PortalExam
  onClose: () => void
  onToast: (message: string) => void
}) {
  const studentLink = `${
    typeof window === "undefined" ? "" : window.location.origin
  }/exam/${exam.id}`
  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value)
      onToast(`${label} copied to clipboard.`)
    } catch {
      window.prompt(`Copy ${label.toLowerCase()}`, value)
    }
  }
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="details-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="exam-details-title"
      >
        <header className="modal-header">
          <div>
            <span className="eyebrow">PUBLISHED EXAMINATION</span>
            <h2 id="exam-details-title">{exam.title}</h2>
            <p>
              {exam.subject} ·{" "}
              {exam.questions.paper1.length + exam.questions.paper2.length}{" "}
              questions
            </p>
          </div>
          <button
            className="close-button"
            onClick={onClose}
            aria-label="Close details"
          >
            ×
          </button>
        </header>
        <div className="details-body">
          <div className="published-code">
            <div>
              <span className="eyebrow">STUDENT ACCESS CODE</span>
              <p>
                Give this six-character code to candidates with the exam link.
              </p>
            </div>
            <strong>{exam.accessCode}</strong>
            <button
              className="secondary-button"
              onClick={() => void copy(exam.accessCode, "Access code")}
            >
              Copy code
            </button>
          </div>
          <div className="detail-field">
            <span>STUDENT EXAM LINK</span>
            <div>
              <code>{studentLink}</code>
              <button
                className="secondary-button"
                onClick={() => void copy(studentLink, "Student link")}
              >
                Copy link
              </button>
            </div>
          </div>
          <div className="details-grid">
            <div>
              <span>SCHEDULE</span>
              <strong>{new Date(exam.startTime).toLocaleString()}</strong>
            </div>
            <div>
              <span>EXAM WINDOW CLOSES</span>
              <strong>{new Date(exam.endTime).toLocaleString()}</strong>
            </div>
            <div>
              <span>DURATION</span>
              <strong>{exam.durationMinutes} minutes</strong>
            </div>
            <div>
              <span>CANDIDATE ATTEMPTS</span>
              <strong>{exam.attempts.length}</strong>
            </div>
          </div>
        </div>
        <footer className="modal-footer">
          <button className="text-button" onClick={onClose}>
            Close
          </button>
          <button
            className="primary-button"
            onClick={() =>
              window.open(`/exam/${exam.id}`, "_blank", "noopener,noreferrer")
            }
          >
            Open student view <span>↗</span>
          </button>
        </footer>
      </section>
    </div>
  )
}

function EmptyExams({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="empty-state">
      <span className="empty-illustration">▤</span>
      <strong>Your first exam starts here</strong>
      <p>
        Create an examination, add questions, and share a secure access link
        with candidates.
      </p>
      <button className="primary-button" onClick={onCreate}>
        Create examination <span>→</span>
      </button>
    </div>
  )
}

function ExamsPage({
  exams,
  onCreate,
  onToast,
  onDetails,
}: {
  exams: PortalExam[]
  onCreate: () => void
  onToast: (message: string) => void
  onDetails: (exam: PortalExam) => void
}) {
  return (
    <>
      <div className="page-heading compact">
        <div>
          <span className="eyebrow">EXAM MANAGEMENT</span>
          <h1>Examinations</h1>
          <p>Create, schedule, and share candidate access.</p>
        </div>
        <button className="primary-button" onClick={onCreate}>
          ＋ Create examination
        </button>
      </div>
      <div className="panel full-panel">
        {exams.length ? (
          <ExamTable
            exams={[...exams].sort((a, b) =>
              b.createdAt.localeCompare(a.createdAt),
            )}
            onToast={onToast}
            onDetails={onDetails}
          />
        ) : (
          <EmptyExams onCreate={onCreate} />
        )}
      </div>
    </>
  )
}

function ResultsPage({ exams }: { exams: PortalExam[] }) {
  const attempts = exams
    .flatMap((exam) =>
      exam.attempts.map((attempt) => ({
        ...attempt,
        examTitle: exam.title,
        subject: exam.subject,
      })),
    )
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
  return (
    <>
      <div className="page-heading compact">
        <div>
          <span className="eyebrow">CANDIDATE PERFORMANCE</span>
          <h1>Results &amp; submissions</h1>
          <p>
            Review objective scores, theory grading, and submission history.
          </p>
        </div>
      </div>
      <div className="panel full-panel">
        {attempts.length ? (
          <div className="table-wrap">
            <table className="exam-table result-table">
              <thead>
                <tr>
                  <th>CANDIDATE</th>
                  <th>EXAMINATION</th>
                  <th>OBJECTIVE</th>
                  <th>THEORY</th>
                  <th>PROCTORING</th>
                  <th>SUBMITTED</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((attempt) => (
                  <tr key={attempt.id}>
                    <td>
                      <span className="subject-avatar candidate-avatar">
                        {initials(attempt.candidateName)}
                      </span>
                      <span className="exam-name">
                        <strong>{attempt.candidateName}</strong>
                        <small>{attempt.candidateNumber || "Candidate"}</small>
                      </span>
                    </td>
                    <td>
                      <strong>{attempt.examTitle}</strong>
                      <small className="td-sub">{attempt.subject}</small>
                    </td>
                    <td>
                      <strong>
                        {attempt.objectiveScore}/{attempt.objectiveMax}
                      </strong>
                    </td>
                    <td>
                      {attempt.theoryScore === undefined ? (
                        <span className="pending">Pending AI grade</span>
                      ) : (
                        <strong>
                          {attempt.theoryScore}/{attempt.theoryMax}
                        </strong>
                      )}
                      <TheoryFeedbackDetails report={attempt.theoryReport} />
                    </td>
                    <td>
                      <strong>
                        {attempt.warnings} warning
                        {attempt.warnings === 1 ? "" : "s"}
                      </strong>
                      <small className="td-sub">
                        {attempt.reshuffleCount} reshuffle
                        {attempt.reshuffleCount === 1 ? "" : "s"}
                      </small>
                    </td>
                    <td>{new Date(attempt.submittedAt).toLocaleString()}</td>
                    <td>
                      <Status
                        state={
                          attempt.status === "locked"
                            ? "Locked"
                            : attempt.status === "graded"
                              ? "Graded"
                              : "Submitted"
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <span className="empty-illustration">▥</span>
            <strong>No submissions yet</strong>
            <p>
              Candidate results will appear here when an examination is
              submitted.
            </p>
          </div>
        )}
      </div>
    </>
  )
}

function TheoryFeedbackDetails({
  report,
}: {
  report?: ExamAttempt["theoryReport"]
}) {
  if (!report?.length) return null
  return (
    <details className="theory-feedback-details">
      <summary>AI examiner notes</summary>
      {report.map((item) => (
        <div key={item.questionId}>
          <strong>
            {item.questionId} · {item.awardedMarks}/{item.maxMarks}
          </strong>
          <p>{item.feedback}</p>
          <small>{item.workedOutSolution}</small>
        </div>
      ))}
    </details>
  )
}

function SettingsPage({ onToast }: { onToast: (message: string) => void }) {
  const [configured, setConfigured] = useState({
    groqConfigured: false,
  })
  useEffect(() => {
    fetch("/api/settings")
      .then((response) => response.json())
      .then(setConfigured)
      .catch(() => {})
  }, [])
  return (
    <>
      <div className="page-heading compact">
        <div>
          <span className="eyebrow">PORTAL CONFIGURATION</span>
          <h1>Settings</h1>
          <p>Configure server integrations and keep credentials private.</p>
        </div>
      </div>
      <section className="settings-grid">
        <div className="panel settings-card">
          <span className="settings-icon blue">✦</span>
          <h2>Groq AI</h2>
          <p>
            Used to parse pasted exam text and grade theory responses. The key
            is read on the server and never sent to the browser.
          </p>
          <div className="config-status">
            <i className={configured.groqConfigured ? "configured" : ""} />
            {configured.groqConfigured
              ? "Configured"
              : "Add GROQ_API_KEY to .env.local"}
          </div>
          <button
            className="secondary-button"
            onClick={() =>
              onToast("Set GROQ_API_KEY in .env.local, then restart pnpm dev.")
            }
          >
            How to configure <span>→</span>
          </button>
        </div>
        <div className="panel settings-card">
          <span className="settings-icon green">◉</span>
          <h2>Local camera checks</h2>
          <p>
            MediaPipe checks the student’s camera feed in the browser before and
            during the exam. Frames stay on the device; no API key, Docker
            service, or paid quota is required.
          </p>
          <div className="config-status">
            <i className="configured" />
            Ready — no API setup needed
          </div>
        </div>
        <div className="panel settings-card">
          <span className="settings-icon purple">▤</span>
          <h2>Local data store</h2>
          <p>
            Exams and attempt records are persisted in the server-side{" "}
            <code>data/exams.json</code> file, so shared student links work
            across devices using this server.
          </p>
          <div className="config-status">
            <i className="configured" />
            Active
          </div>
        </div>
      </section>
    </>
  )
}

function CreateExamModal({
  onClose,
  onSave,
}: {
  onClose: () => void
  onSave: (exam: PortalExam) => Promise<void>
}) {
  const [title, setTitle] = useState("")
  const [subject, setSubject] = useState("")
  const [startTime, setStartTime] = useState(() =>
    dateInput(new Date(Date.now() + 5 * 60_000)),
  )
  const [endTime, setEndTime] = useState(() =>
    dateInput(new Date(Date.now() + 3 * 60 * 60_000)),
  )
  const [duration, setDuration] = useState(60)
  const [warningSecs, setWarningSecs] = useState(3)
  const [lockoutSecs, setLockoutSecs] = useState(7)
  const [maxWarnings, setMaxWarnings] = useState(3)
  const [maxRetries, setMaxRetries] = useState(2)
  const [rawText, setRawText] = useState("")
  const [parsed, setParsed] = useState<Parsed | null>(null)
  const [answerNotice, setAnswerNotice] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState<1 | 2>(1)

  async function parseText() {
    if (!rawText.trim()) {
      setError("Paste the exam questions first.")
      return
    }
    setBusy(true)
    setError("")
    try {
      const response = await fetch("/api/exams/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText }),
      })
      const result = (await response.json()) as Parsed & { error?: string }
      if (!response.ok)
        throw new Error(result.error || "Could not parse exam text")
      setParsed({
        paper1: result.paper1.map((question) => ({
          ...question,
          correctOptionId: question.correctOptionId || "",
        })),
        paper2: result.paper2,
        source: result.source,
      })
      setAnswerNotice("")
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not parse exam text",
      )
    } finally {
      setBusy(false)
    }
  }

  async function reviewQuestions() {
    if (!parsed) return
    setStep(2)
    setBusy(true)
    setError("")
    setAnswerNotice(
      "Asking Groq to solve the questions and draft the marking guide…",
    )
    try {
      const response = await fetch("/api/exams/answer-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paper1: parsed.paper1, paper2: parsed.paper2 }),
      })
      const suggestions = (await response.json()) as {
        paper1?: Array<{ id: string; correctOptionId: string }>
        paper2?: Array<{
          id: string
          expectedAnswer: string
          rubric: Array<{ criterion: string; marks: number }>
        }>
        error?: string
      }
      if (!response.ok)
        throw new Error(
          suggestions.error || "AI answer suggestions are unavailable.",
        )
      setParsed(
        (current) =>
          current && {
            ...current,
            paper1: current.paper1.map((question) => {
              const suggestion = suggestions.paper1?.find(
                (item) => item.id === question.id,
              )
              return {
                ...question,
                correctOptionId:
                  question.correctOptionId || suggestion?.correctOptionId || "",
              }
            }),
            paper2: current.paper2.map((question) => {
              const suggestion = suggestions.paper2?.find(
                (item) => item.id === question.id,
              )
              return {
                ...question,
                expectedAnswer:
                  question.expectedAnswer || suggestion?.expectedAnswer || "",
                rubric: question.rubric?.length
                  ? question.rubric
                  : suggestion?.rubric,
              }
            }),
          },
      )
      setAnswerNotice(
        "AI answer suggestions are ready. Review and edit every key or marking guide before publishing.",
      )
    } catch (cause) {
      setAnswerNotice(
        `${
          cause instanceof Error ? cause.message : "AI suggestions unavailable."
        } You can enter or edit answers manually below.`,
      )
    } finally {
      setBusy(false)
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault()
    if (!parsed || (!parsed.paper1.length && !parsed.paper2.length)) {
      setError("Parse at least one question before continuing.")
      setStep(1)
      return
    }
    if (parsed.paper1.some((question) => !question.correctOptionId)) {
      setError("Select the answer key for each objective question.")
      setStep(2)
      return
    }
    setBusy(true)
    setError("")
    try {
      const exam: PortalExam = {
        id: crypto.randomUUID(),
        title: title.trim(),
        subject: subject.trim(),
        accessCode: "",
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        durationMinutes: duration,
        lookAwayWarningSecs: warningSecs,
        lockoutThresholdSecs: lockoutSecs,
        maxWarnings,
        maxRetries,
        questions: parsed,
        attempts: [],
        createdAt: new Date().toISOString(),
      }
      await onSave(exam)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create exam")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="create-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-title"
      >
        <header className="modal-header">
          <div>
            <span className="eyebrow">NEW WASSCE EXAMINATION</span>
            <h2 id="create-title">Create an examination</h2>
            <p>
              Set up the assessment, add questions, and generate candidate
              access.
            </p>
          </div>
          <button className="close-button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="stepper">
          <span className={step === 1 ? "step active" : "step done"}>
            <b>1</b> Exam setup
          </span>
          <i />
          <span className={step === 2 ? "step active" : "step"}>
            <b>2</b> Review questions
          </span>
        </div>
        <form onSubmit={create}>
          {step === 1 ? (
            <div className="form-content">
              <div className="form-grid">
                <Field label="Examination title">
                  <input
                    required
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="e.g. Integrated Science — Mock 1"
                  />
                </Field>
                <Field label="Subject">
                  <input
                    required
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    placeholder="e.g. Integrated Science"
                  />
                </Field>
                <Field label="Start date & time">
                  <input
                    type="datetime-local"
                    required
                    value={startTime}
                    onChange={(event) => setStartTime(event.target.value)}
                  />
                </Field>
                <Field label="End date & time">
                  <input
                    type="datetime-local"
                    required
                    value={endTime}
                    onChange={(event) => setEndTime(event.target.value)}
                  />
                </Field>
                <Field label="Duration (minutes)">
                  <input
                    type="number"
                    min={1}
                    max={480}
                    required
                    value={duration}
                    onChange={(event) =>
                      setDuration(Number(event.target.value))
                    }
                  />
                </Field>
                <div className="field">
                  <label>Candidate access</label>
                  <div className="access-preview">
                    <span>✦</span> A unique six-character code will be generated
                    when you publish.
                  </div>
                </div>
              </div>
              <div className="section-divider">
                <div>
                  <strong>Anti-cheat thresholds</strong>
                  <small>
                    Applied during the student’s local camera checks.
                  </small>
                </div>
              </div>
              <div className="form-grid four">
                <Field label="Look-away warning (sec)">
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={warningSecs}
                    onChange={(event) =>
                      setWarningSecs(Number(event.target.value))
                    }
                  />
                </Field>
                <Field label="Lockout after (sec)">
                  <input
                    type="number"
                    min={2}
                    max={120}
                    value={lockoutSecs}
                    onChange={(event) =>
                      setLockoutSecs(Number(event.target.value))
                    }
                  />
                </Field>
                <Field label="Maximum warnings">
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={maxWarnings}
                    onChange={(event) =>
                      setMaxWarnings(Number(event.target.value))
                    }
                  />
                </Field>
                <Field label="Re-entry retries">
                  <input
                    type="number"
                    min={0}
                    max={10}
                    value={maxRetries}
                    onChange={(event) =>
                      setMaxRetries(Number(event.target.value))
                    }
                  />
                </Field>
              </div>
              <div className="section-divider">
                <div>
                  <strong>Add questions</strong>
                  <small>
                    Paste raw questions. AI parsing is used when GROQ_API_KEY is
                    configured; a local parser is also available.
                  </small>
                </div>
                <span className="ai-tag">✦ AI PARSER</span>
              </div>
              <Field label="Raw examination text">
                <textarea
                  className="raw-exam-text"
                  value={rawText}
                  onChange={(event) => setRawText(event.target.value)}
                  placeholder={`PAPER 1 — OBJECTIVES\n1. Which organ filters waste from the blood?\nA. Heart\nB. Kidney\nC. Liver\nD. Lung\n\nPAPER 2 — THEORY\n1. Explain how urine is formed in the nephron. [10 marks]`}
                />
              </Field>
              <div className="parse-line">
                <span>
                  {parsed
                    ? `${parsed.paper1.length} objective · ${parsed.paper2.length} theory questions parsed${
                        parsed.source === "local" ? " locally" : " with AI"
                      }`
                    : "Supports numbered questions and A–E option lists."}
                </span>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={parseText}
                  disabled={busy}
                >
                  {busy ? "Parsing…" : "✦ Parse questions"}
                </button>
              </div>
            </div>
          ) : (
            <div className="form-content review-content">
              <div className="review-intro">
                <span className="review-count">
                  {(parsed?.paper1.length || 0) + (parsed?.paper2.length || 0)}
                </span>
                <span>
                  <strong>Review the parsed questions</strong>
                  <small>
                    AI answers are drafts; confirm or edit before publishing.
                  </small>
                </span>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={reviewQuestions}
                  disabled={busy}
                >
                  ✦ Fill missing AI answers
                </button>
              </div>
              {answerNotice && (
                <div className="ai-answer-notice" role="status">
                  {answerNotice}
                </div>
              )}
              {parsed?.paper1.map((question, index) => (
                <article className="question-review" key={question.id}>
                  <div className="question-label">
                    PAPER 1 · QUESTION {index + 1}
                    <span>AI SUGGESTED KEY · {question.marks || 1} mark</span>
                  </div>
                  <strong>{question.stem}</strong>
                  <div className="option-review">
                    {question.options.map((option) => (
                      <label
                        key={option.id}
                        className={
                          question.correctOptionId === option.id
                            ? "option-pick selected"
                            : "option-pick"
                        }
                      >
                        <input
                          type="radio"
                          name={`key-${question.id}`}
                          checked={question.correctOptionId === option.id}
                          onChange={() =>
                            setParsed(
                              (value) =>
                                value && {
                                  ...value,
                                  paper1: value.paper1.map((q) =>
                                    q.id === question.id
                                      ? { ...q, correctOptionId: option.id }
                                      : q,
                                  ),
                                },
                            )
                          }
                        />
                        <b>{option.label}</b>
                        <span>{option.text}</span>
                      </label>
                    ))}
                  </div>
                </article>
              ))}
              {parsed?.paper2.map((question, index) => (
                <article
                  className="question-review theory-review"
                  key={question.id}
                >
                  <div className="question-label">
                    PAPER 2 · QUESTION {index + 1}
                    <span>AI MODEL ANSWER · {question.marks} marks</span>
                  </div>
                  <strong>{question.prompt}</strong>
                  <textarea
                    placeholder="AI model answer — edit as needed"
                    value={question.expectedAnswer || ""}
                    onChange={(event) =>
                      setParsed(
                        (value) =>
                          value && {
                            ...value,
                            paper2: value.paper2.map((q) =>
                              q.id === question.id
                                ? { ...q, expectedAnswer: event.target.value }
                                : q,
                            ),
                          },
                      )
                    }
                  />
                  <RubricEditor
                    rubric={question.rubric || []}
                    onChange={(rubric) =>
                      setParsed(
                        (value) =>
                          value && {
                            ...value,
                            paper2: value.paper2.map((q) =>
                              q.id === question.id ? { ...q, rubric } : q,
                            ),
                          },
                      )
                    }
                  />
                </article>
              ))}
            </div>
          )}
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <footer className="modal-footer">
            <button
              type="button"
              className="text-button"
              onClick={
                step === 1
                  ? onClose
                  : () => {
                      setStep(1)
                      setError("")
                    }
              }
            >
              {step === 1 ? "Cancel" : "← Back to setup"}
            </button>
            {step === 1 ? (
              <button
                type="button"
                className="primary-button"
                disabled={!parsed || busy}
                onClick={reviewQuestions}
              >
                {busy ? "Generating AI answers…" : "Review & generate answers"}{" "}
                <span>→</span>
              </button>
            ) : (
              <button type="submit" className="primary-button" disabled={busy}>
                {busy ? "Creating…" : "Create & schedule exam"}
                <span>→</span>
              </button>
            )}
          </footer>
        </form>
      </section>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  )
}

function RubricEditor({
  rubric,
  onChange,
}: {
  rubric: Array<{ criterion: string; marks: number }>
  onChange: (rubric: Array<{ criterion: string; marks: number }>) => void
}) {
  return (
    <div className="rubric-editor">
      <div className="rubric-editor-heading">
        AI MARKING GUIDE <small>Edit criteria or marks</small>
      </div>
      {rubric.map((item, index) => (
        <div className="rubric-edit-row" key={`${index}-${item.criterion}`}>
          <input
            aria-label={`Criterion ${index + 1}`}
            value={item.criterion}
            onChange={(event) =>
              onChange(
                rubric.map((part, i) =>
                  i === index
                    ? { ...part, criterion: event.target.value }
                    : part,
                ),
              )
            }
          />
          <input
            aria-label={`Marks for criterion ${index + 1}`}
            type="number"
            min={0}
            value={item.marks}
            onChange={(event) =>
              onChange(
                rubric.map((part, i) =>
                  i === index
                    ? { ...part, marks: Number(event.target.value) }
                    : part,
                ),
              )
            }
          />
          <button
            type="button"
            aria-label={`Remove criterion ${index + 1}`}
            onClick={() => onChange(rubric.filter((_, i) => i !== index))}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-button add-rubric-row"
        onClick={() =>
          onChange([...rubric, { criterion: "New criterion", marks: 1 }])
        }
      >
        ＋ Add marking criterion
      </button>
    </div>
  )
}
