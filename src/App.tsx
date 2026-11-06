"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { FormEvent } from "react"
import type { ObjectiveQuestion, TheoryPart } from "./lib/examTypes"
import { defaultGradeBands, type ExamAttempt, type GradeBand, type PortalExam } from "./lib/portalTypes"
import type { StudentClass, StudentProfile } from "./lib/studentTypes"

type View = "overview" | "exams" | "students" | "results" | "settings"
type Parsed = {
  paper1: ObjectiveQuestion[]
  paper2: TheoryPart[]
  source?: string
}

type IconName =
  | "home"
  | "exam"
  | "results"
  | "settings"
  | "help"
  | "shield"
  | "ai"
  | "camera"
  | "users"
  | "check"
  | "database"
  | "chevron"
  | "external"
  | "link"
  | "close"
  | "plus"

const navItems: { id: View; label: string; icon: IconName }[] = [
  { id: "overview", label: "Overview", icon: "home" },
  { id: "exams", label: "Examinations", icon: "exam" },
  { id: "students", label: "Students", icon: "users" },
  { id: "results", label: "Results", icon: "results" },
  { id: "settings", label: "Settings", icon: "settings" },
]

function UiIcon({ name }: { name: IconName }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {name === "home" && (
        <>
          <path d="m3 10 9-7 9 7" />
          <path d="M5 9v11h14V9M9 20v-6h6v6" />
        </>
      )}
      {name === "exam" && (
        <>
          <path d="M7 3h8l4 4v14H7z" />
          <path d="M15 3v5h4M10 12h6M10 16h6" />
        </>
      )}
      {name === "results" && (
        <>
          <path d="M4 20V10h4v10M10 20V4h4v16M16 20v-7h4v7" />
          <path d="M3 20h18" />
        </>
      )}
      {name === "settings" && (
        <>
          <path d="M4 6h16M4 12h16M4 18h16" />
          <circle cx="8" cy="6" r="2" fill="currentColor" stroke="none" />
          <circle cx="15" cy="12" r="2" fill="currentColor" stroke="none" />
          <circle cx="10" cy="18" r="2" fill="currentColor" stroke="none" />
        </>
      )}
      {name === "help" && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M9.6 9a2.5 2.5 0 1 1 4.6 1.3c-.8 1.1-2.2 1.2-2.2 2.7M12 16.5h.01" />
        </>
      )}
      {name === "shield" && (
        <>
          <path d="M12 3 20 6v5c0 5-3.4 8.2-8 10-4.6-1.8-8-5-8-10V6z" />
          <path d="m9 12 2 2 4-4" />
        </>
      )}
      {name === "ai" && (
        <>
          <rect x="7" y="7" width="10" height="10" rx="2" />
          <path d="M10 11h4M10 14h2M9 3v4m6-4v4M9 17v4m6-4v4M3 9h4m-4 6h4m10-6h4m-4 6h4" />
        </>
      )}
      {name === "camera" && (
        <>
          <path d="M4 7h3l1.5-2h7L17 7h3v12H4z" />
          <circle cx="12" cy="13" r="3.5" />
        </>
      )}
      {name === "users" && (
        <>
          <circle cx="9" cy="8" r="3" />
          <path d="M3.5 20v-1.5a5.5 5.5 0 0 1 11 0V20zM16 5.5a3 3 0 0 1 0 5.8M17 14a4 4 0 0 1 3.5 4v2" />
        </>
      )}
      {name === "check" && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="m8 12 2.5 2.5L16 9" />
        </>
      )}
      {name === "database" && (
        <>
          <ellipse cx="12" cy="5" rx="8" ry="3" />
          <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
        </>
      )}
      {name === "chevron" && <path d="m9 6 6 6-6 6" />}
      {name === "external" && (
        <>
          <path d="M14 5h5v5M19 5l-8 8" />
          <path d="M18 13v5H5V5h5" />
        </>
      )}
      {name === "link" && (
        <g strokeWidth="2.8">
          <path d="m9.5 14.5-2 2a4 4 0 0 1-5.7-5.7l4.5-4.5a4 4 0 0 1 5.7 0" />
          <path d="m14.5 9.5 2-2a4 4 0 0 1 5.7 5.7l-4.5 4.5a4 4 0 0 1-5.7 0" />
          <path d="m8.5 15.5 7-7" />
        </g>
      )}
      {name === "close" && <path d="m7 7 10 10M17 7 7 17" />}
      {name === "plus" && <path d="M12 5v14M5 12h14" />}
    </svg>
  )
}

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

function adjustGradeBand(
  bands: GradeBand[],
  index: number,
  field: "minimum" | "maximum",
  rawValue: number,
) {
  const value = Math.max(0, Math.min(100, rawValue))
  const next = bands.map((band) => ({ ...band }))
  next[index][field] = value
  if (field === "minimum" && index > 0)
    next[index - 1].maximum = Math.min(100, value - 1)
  if (field === "maximum" && index < next.length - 1)
    next[index + 1].minimum = Math.max(0, value + 1)
  return next
}

export default function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [exams, setExams] = useState<PortalExam[]>([])
  const [view, setView] = useState<View>("overview")
  const [showCreate, setShowCreate] = useState(false)
  const [detailsExam, setDetailsExam] = useState<PortalExam | null>(null)
  const [editExam, setEditExam] = useState<PortalExam | null>(null)
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
    setToast(createdExam.assignedClassIds?.length
      ? `Exam created and assigned to ${createdExam.assignedClassIds.length} class${createdExam.assignedClassIds.length === 1 ? "" : "es"}.`
      : "Exam created. Assign it to classes or individual students from the Students panel.")
  }

  async function saveEditedExam(exam: PortalExam) {
    const response = await fetch(`/api/exams/${exam.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(exam),
    })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error || "Could not update exam")
    await loadExams()
    setEditExam(null)
    setDetailsExam(body.exam as PortalExam)
    const updatedExam = body.exam as PortalExam
    setToast(updatedExam.assignedClassIds?.length
      ? `Exam updated and assigned to ${updatedExam.assignedClassIds.length} class${updatedExam.assignedClassIds.length === 1 ? "" : "es"}.`
      : "Exam updated successfully.")
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
              <span>✓ Scheduled exams assigned to students</span>
              <span>✓ Objective and theory results</span>
            </div>
          </div>
          <small className="hero-foot">VIRTUAL EXAM · TEACHER PORTAL</small>
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
              <UiIcon name="chevron" />
            </button>
            {loginError && (
              <div className="inline-error" role="alert">
                {loginError}
              </div>
            )}
            <div className="login-note">
              <span><UiIcon name="shield" /></span>
              <p>
                Your session is protected with an HTTP-only cookie and expires
                after 8 hours.
              </p>
            </div>
            <a className="student-portal-link" href="/student">
              Student? Sign in or request an account
            </a>
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
              <span className="nav-icon"><UiIcon name={item.icon} /></span>
              {item.label}
              {item.id === "exams" && exams.length > 0 && (
                <span className="nav-count">{exams.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="support-card">
            <span className="support-icon"><UiIcon name="help" /></span>
            <strong>Need a hand?</strong>
            <p>Build a reliable exam in just a few steps.</p>
            <button onClick={() => setShowCreate(true)}>
              Create an exam <UiIcon name="chevron" />
            </button>
          </div>
          <div className="user-row">
            <span className="teacher-avatar">TA</span>
            <div>
              <strong>Teacher Admin</strong>
              <small>Exam coordinator</small>
            </div>
            <button title="Sign out" onClick={signOut}>
              <UiIcon name="external" />
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
          {view === "students" && <StudentsPage exams={exams} onToast={setToast} />}
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
          onManageStudents={() => {
            setDetailsExam(null)
            setView("students")
          }}
          onEdit={() => {
            setDetailsExam(null)
            setEditExam(detailsExam)
          }}
        />
      )}
      {editExam && (
        <CreateExamModal
          initialExam={editExam}
          onClose={() => setEditExam(null)}
          onSave={saveEditedExam}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          ✓ <span>{toast}</span>
          <button onClick={() => setToast("")} aria-label="Dismiss notification"><UiIcon name="close" /></button>
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
        <strong>Virtual Exam</strong>
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
            Good day, Teacher
          </h1>
          <p>Here’s the latest activity across your examination workspace.</p>
        </div>
        <button className="primary-button" onClick={onCreate}>
          <UiIcon name="plus" /> Create examination
        </button>
      </div>
      <section className="metric-grid">
        <Metric
          label="Total examinations"
          value={stats.exams}
          foot="Created in this workspace"
          icon="exam"
          tint="blue"
        />
        <Metric
          label="Live right now"
          value={stats.live}
          foot={stats.live ? "Candidates can enter" : "No active sessions"}
          icon="camera"
          tint="green"
        />
        <Metric
          label="Candidate attempts"
          value={stats.candidates}
          foot="Across all examinations"
          icon="users"
          tint="purple"
        />
        <Metric
          label="Graded submissions"
          value={stats.graded}
          foot="Objective + theory"
          icon="check"
          tint="amber"
        />
      </section>
      <section className="dashboard-grid">
        <div className="panel recent-panel">
          <div className="panel-head">
            <div>
              <h2>Recent examinations</h2>
              <p>Manage schedules and student assignments.</p>
            </div>
            <button className="text-button" onClick={() => onView("exams")}>
              <span>View all <UiIcon name="chevron" /></span>
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
            <span className="quick-icon qi-blue"><UiIcon name="exam" /></span>
            <span>
              <strong>Create an examination</strong>
              <small>Set questions, schedule and access</small>
            </span>
            <b><UiIcon name="chevron" /></b>
          </button>
          <button className="quick-action" onClick={() => onView("results")}>
            <span className="quick-icon qi-green"><UiIcon name="results" /></span>
            <span>
              <strong>Review results</strong>
              <small>Scores and candidate submissions</small>
            </span>
            <b><UiIcon name="chevron" /></b>
          </button>
          <div className="proctor-note">
            <span><UiIcon name="camera" /></span>
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
        <strong>WASSCE standard, built in.</strong> Questions can
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
  icon: IconName
  tint: string
}) {
  return (
    <article className="metric-card">
      <div className="metric-top">
        <span>{label}</span>
        <i className={`metric-icon ${tint}`}><UiIcon name={icon} /></i>
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
    <div className="exam-card-list">
      {exams.map((exam) => (
        <article className="exam-summary-card" key={exam.id}>
          <div className="exam-summary-main">
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
          </div>
          <div className="exam-summary-detail">
                <strong>{new Date(exam.startTime).toLocaleDateString()}</strong>
                <small className="td-sub">
                  {new Date(exam.startTime).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  · {exam.durationMinutes} min
                </small>
          </div>
          <div className="exam-summary-detail">
                <Status state={examState(exam)} />
          </div>
          <div className="exam-summary-detail attempts-detail">
                <small>Attempts</small>
                <span className="attempt-count">{exam.attempts.length}</span>
          </div>
          <div>
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
                    <UiIcon name="link" />
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
                    <UiIcon name="external" />
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
                    <UiIcon name="close" />
                  </button>
                </div>
          </div>
        </article>
      ))}
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
    onToast("Student exam link copied. Only students assigned this exam can open it.")
  } catch {
    window.prompt("Copy this student exam link. Students must sign in to an assigned account.", `${window.location.origin}/exam/${exam.id}`)
  }
}

function ExamDetailsModal({
  exam,
  onClose,
  onToast,
  onManageStudents,
  onEdit,
}: {
  exam: PortalExam
  onClose: () => void
  onToast: (message: string) => void
  onManageStudents: () => void
  onEdit: () => void
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
            <UiIcon name="close" />
          </button>
        </header>
        <div className="details-body">
          <div className="published-code">
            <div>
              <span className="eyebrow">STUDENT ASSIGNMENT REQUIRED</span>
              <p>
                Assign this exam to approved student accounts in the Students panel. Sign-in and assignment checks protect the questions.
              </p>
            </div>
            <button
              className="secondary-button"
              onClick={onManageStudents}
            >
              Manage student assignments
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
          <div className="modal-footer-actions">
            <button className="secondary-button" onClick={onEdit}>
              Edit examination
            </button>
            <button className="text-button" onClick={onClose}>Close</button>
          </div>
          <button
            className="primary-button"
            onClick={() =>
              window.open(`/exam/${exam.id}`, "_blank", "noopener,noreferrer")
            }
          >
            Open student view <UiIcon name="external" />
          </button>
        </footer>
      </section>
    </div>
  )
}

function EmptyExams({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="empty-state">
      <span className="empty-illustration"><UiIcon name="exam" /></span>
      <strong>Your first exam starts here</strong>
      <p>
        Create an examination, add questions, and share a secure access link
        with candidates.
      </p>
      <button className="primary-button" onClick={onCreate}>
        Create examination <UiIcon name="chevron" />
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
          <p>Create examinations and assign them to your students.</p>
        </div>
        <button className="primary-button" onClick={onCreate}>
          <UiIcon name="plus" /> Create examination
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
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set())
  const attempts = exams
    .flatMap((exam) =>
      exam.attempts.map((attempt) => ({
        ...attempt,
        examId: exam.id,
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
                      <TheoryFeedbackDetails
                        report={attempt.theoryReport}
                        photoAnswers={attempt.photoAnswers}
                        examId={attempt.examId}
                        attemptId={attempt.id}
                        reviewed={Boolean(attempt.teacherReviewed) || reviewedIds.has(attempt.id)}
                        onReviewed={() => setReviewedIds((current) => new Set(current).add(attempt.id))}
                      />
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
                              ? attempt.teacherReviewed || reviewedIds.has(attempt.id) ? "Reviewed" : "Review"
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
            <span className="empty-illustration"><UiIcon name="results" /></span>
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
  photoAnswers,
  examId,
  attemptId,
  reviewed: initialReviewed,
  onReviewed,
}: {
  report?: ExamAttempt["theoryReport"]
  photoAnswers?: ExamAttempt["photoAnswers"]
  examId: string
  attemptId: string
  reviewed: boolean
  onReviewed: () => void
}) {
  const [reviewed, setReviewed] = useState(initialReviewed)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  if (!report?.length && !Object.keys(photoAnswers || {}).length) return null
  async function markReviewed() {
    setBusy(true)
    setError("")
    try {
      const response = await fetch(`/api/exams/${examId}/attempts/${attemptId}/review`, { method: "POST" })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Could not save the review.")
      setReviewed(true)
      onReviewed()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the review.")
    } finally {
      setBusy(false)
    }
  }
  return (
    <details className="theory-feedback-details">
      <summary>AI notes and submitted work</summary>
      {Object.entries(photoAnswers || {}).map(([questionId, image]) => (
        <div key={`photo-${questionId}`}>
          <strong>{questionId} · handwritten answer</strong>
          <a href={image} target="_blank" rel="noreferrer">
            <img className="submitted-answer-photo" src={image} alt={`Handwritten answer for ${questionId}`} />
          </a>
        </div>
      ))}
      {(report || []).map((item) => (
        <div key={item.questionId}>
          <strong>
            {item.questionId} · {item.awardedMarks}/{item.maxMarks}
          </strong>
          <p>{item.feedback}</p>
          <small>{item.workedOutSolution}</small>
        </div>
      ))}
      {report?.length ? (
        <div className="teacher-review-action">
          {reviewed ? (
            <strong>Teacher review recorded</strong>
          ) : (
            <button type="button" className="secondary-button" disabled={busy} onClick={markReviewed}>
              {busy ? "Saving review…" : "Mark as teacher reviewed"}
            </button>
          )}
          {error && <small role="alert">{error}</small>}
        </div>
      ) : null}
    </details>
  )
}

type ManagedStudent = StudentProfile & {
  assignedExamIds: string[]
  createdAt: string
}

function StudentsPage({
  exams,
  onToast,
}: {
  exams: PortalExam[]
  onToast: (message: string) => void
}) {
  const [students, setStudents] = useState<ManagedStudent[]>([])
  const [classes, setClasses] = useState<StudentClass[]>([])
  const [selectedClass, setSelectedClass] = useState("")
  const [selectedExam, setSelectedExam] = useState("")
  const [newClassName, setNewClassName] = useState("")
  const [newStudent, setNewStudent] = useState({ fullName: "", studentNumber: "", waecCandidateNumber: "", classId: "" })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [temporaryPassword, setTemporaryPassword] = useState<{
    studentId: string
    value: string
  } | null>(null)

  const loadStudents = useCallback(async () => {
    const [studentsResponse, classesResponse] = await Promise.all([
      fetch("/api/students", { cache: "no-store" }),
      fetch("/api/classes", { cache: "no-store" }),
    ])
    const [studentsBody, classesBody] = await Promise.all([studentsResponse.json(), classesResponse.json()])
    if (!studentsResponse.ok) throw new Error(studentsBody.error || "Could not load student accounts.")
    if (!classesResponse.ok) throw new Error(classesBody.error || "Could not load classes.")
    const accounts = studentsBody.students as ManagedStudent[]
    setStudents(accounts.sort((left, right) => {
      if (left.status === "pending" && right.status !== "pending") return -1
      if (right.status === "pending" && left.status !== "pending") return 1
      return left.fullName.localeCompare(right.fullName)
    }))
    setClasses(classesBody.classes as StudentClass[])
  }, [])

  useEffect(() => {
    void loadStudents().catch((cause) =>
      setError(cause instanceof Error ? cause.message : "Could not load student accounts."),
    )
    const timer = window.setInterval(() => {
      void loadStudents().catch(() => {})
    }, 15000)
    return () => window.clearInterval(timer)
  }, [loadStudents])

  async function updateStudent(payload: Record<string, unknown>) {
    setBusy(true)
    setError("")
    try {
      const response = await fetch("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Could not update student account.")
      if (typeof body.temporaryPassword === "string") {
        const studentId = (body.student?.id || payload.studentId) as string | undefined
        if (studentId) setTemporaryPassword({ studentId, value: body.temporaryPassword })
      }
      if (payload.action === "create")
        setNewStudent({ fullName: "", studentNumber: "", waecCandidateNumber: "", classId: "" })
      await loadStudents()
      if (payload.action === "assign-class")
        onToast(`Exam assignment updated for ${body.count} active student${body.count === 1 ? "" : "s"}.`)
      else if (payload.action === "assign")
        onToast(payload.assigned ? "Examination assigned to student." : "Examination removed from student.")
      else if (payload.action === "approve") onToast("Student account approved.")
      else if (payload.action === "reset-password") onToast("Temporary password created. Share it with the student securely.")
      else if (payload.action === "set-status") onToast("Student account updated.")
      else if (payload.action === "create") onToast("Student account created. Give the temporary password to the student.")
      else if (payload.action === "edit") onToast("Student details updated.")
      else if (payload.action === "delete") onToast(`Student account deleted; ${body.attemptsRemoved || 0} saved attempt(s) removed.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update student account.")
    } finally {
      setBusy(false)
    }
  }

  async function createClass(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError("")
    try {
      const response = await fetch("/api/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", name: newClassName }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Could not create class.")
      setNewClassName("")
      await loadStudents()
      onToast(`Class ${body.class.name} created.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create class.")
    } finally {
      setBusy(false)
    }
  }

  async function deleteClass(studentClass: StudentClass) {
    if (!window.confirm(`Delete class “${studentClass.name}”? Classes with students cannot be deleted.`)) return
    setBusy(true)
    setError("")
    try {
      const response = await fetch("/api/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id: studentClass.id }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Could not delete class.")
      await loadStudents()
      onToast("Class deleted.")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete class.")
    } finally {
      setBusy(false)
    }
  }

  function deleteStudent(student: ManagedStudent) {
    const confirmed = window.confirm(
      `Permanently delete ${student.fullName} (${student.studentNumber})? Their account, exam assignments, and saved attempt/results will be removed. This cannot be undone.`,
    )
    if (confirmed) void updateStudent({ action: "delete", studentId: student.id })
  }

  return (
    <>
      <div className="page-heading compact">
        <div>
          <span className="eyebrow">CANDIDATE ACCOUNTS</span>
          <h1>Students</h1>
          <p>Create classes and student accounts, approve registrations, assign exams, and manage student details.</p>
        </div>
        <span className="student-admin-count">{students.length} account{students.length === 1 ? "" : "s"}</span>
      </div>
      <section className="student-management-grid">
        <form className="panel student-create-panel" onSubmit={createClass}>
          <div className="panel-head"><div><h2>Classes</h2><p>Students choose from these classes when registering.</p></div></div>
          <div className="student-create-row">
            <label>New class name<input value={newClassName} onChange={(event) => setNewClassName(event.target.value)} placeholder="e.g. Form 3A" minLength={2} maxLength={50} required /></label>
            <button className="primary-button" disabled={busy || !newClassName.trim()}>Add class</button>
          </div>
          {classes.length ? <div className="student-class-list">{classes.map((studentClass) => {
            const memberCount = students.filter((student) => student.classId === studentClass.id).length
            return <div className="student-class-chip" key={studentClass.id}><span><strong>{studentClass.name}</strong><small>{memberCount} student{memberCount === 1 ? "" : "s"}</small></span><button type="button" className="text-button danger-text" disabled={busy || memberCount > 0} title={memberCount ? "Move or delete the students first" : "Delete class"} onClick={() => void deleteClass(studentClass)}>Delete</button></div>
          })}</div> : <p className="student-no-exams">No classes yet. Add a class before creating student accounts.</p>}
        </form>
        <form className="panel student-create-panel" onSubmit={(event) => { event.preventDefault(); void updateStudent({ action: "create", ...newStudent }) }}>
          <div className="panel-head"><div><h2>Add a student</h2><p>Create a ready-to-use account and share its temporary password privately.</p></div></div>
          <div className="student-add-fields">
            <label>Student full name<input value={newStudent.fullName} onChange={(event) => setNewStudent((current) => ({ ...current, fullName: event.target.value }))} autoComplete="name" minLength={3} maxLength={100} required /></label>
            <label>School Student ID<input value={newStudent.studentNumber} onChange={(event) => setNewStudent((current) => ({ ...current, studentNumber: event.target.value }))} autoComplete="off" minLength={2} maxLength={32} required /></label>
            <label>Class<select value={newStudent.classId} onChange={(event) => setNewStudent((current) => ({ ...current, classId: event.target.value }))} required><option value="">Select class</option>{classes.map((studentClass) => <option value={studentClass.id} key={studentClass.id}>{studentClass.name}</option>)}</select></label>
            <label>WAEC candidate number <span className="optional-label">Optional</span><input value={newStudent.waecCandidateNumber} onChange={(event) => setNewStudent((current) => ({ ...current, waecCandidateNumber: event.target.value }))} maxLength={32} /></label>
          </div>
          <button className="primary-button" disabled={busy || !classes.length}>Create student account</button>
          {!classes.length && <small className="student-form-help">Add a class first so the account can be assigned to it.</small>}
        </form>
      </section>
      <section className="panel student-allocation-panel">
        <div className="panel-head">
          <div>
            <h2>Assign an exam to a class</h2>
            <p>Only approved students in the selected class receive the assignment.</p>
          </div>
        </div>
        <div className="student-allocation-controls">
          <label>
            Class
            <select value={selectedClass} onChange={(event) => setSelectedClass(event.target.value)}>
              <option value="">Select a class</option>
              {classes.map((studentClass) => <option key={studentClass.id} value={studentClass.id}>{studentClass.name}</option>)}
            </select>
          </label>
          <label>
            Examination
            <select value={selectedExam} onChange={(event) => setSelectedExam(event.target.value)}>
              <option value="">Select an examination</option>
              {exams.map((exam) => <option key={exam.id} value={exam.id}>{exam.title} · {exam.subject}</option>)}
            </select>
          </label>
          <button
            className="primary-button"
            disabled={busy || !selectedClass || !selectedExam}
            onClick={() => void updateStudent({ action: "assign-class", classId: selectedClass, examId: selectedExam, assigned: true })}
          >
            Assign to class
          </button>
        </div>
      </section>
      {error && <div className="inline-error" role="alert">{error}</div>}
      {!students.length ? (
        <section className="panel empty-state student-empty-state">
          <span className="empty-illustration"><UiIcon name="users" /></span>
          <strong>No student registrations yet</strong>
          <p>Create a class and add student accounts here, or let students request access through the registration page.</p>
          <a className="secondary-button" href="/student">Open student registration</a>
        </section>
      ) : (
        <section className="student-admin-list">
          {students.map((student) => {
            const classAssignedExamIds = exams
              .filter((exam) => exam.assignedClassIds?.includes(student.classId))
              .map((exam) => exam.id)
            const assignedCount = new Set([...student.assignedExamIds, ...classAssignedExamIds]).size
            return (
            <article className="panel student-admin-card" key={student.id}>
              <div className="student-admin-main">
                <span className="student-admin-avatar">{initials(student.fullName)}</span>
                <div className="student-admin-name">
                  <strong>{student.fullName}</strong>
                  <span>{student.studentNumber} · {student.className}</span>
                  {student.waecCandidateNumber && <small>WAEC no. {student.waecCandidateNumber}</small>}
                </div>
                <span className={`status ${student.status === "active" ? "status-live" : student.status === "pending" ? "status-scheduled" : "status-locked"}`}>
                  {student.status}
                </span>
              </div>
              <div className="student-admin-actions">
                {student.status === "pending" ? (
                  <button className="primary-button" disabled={busy} onClick={() => void updateStudent({ action: "approve", studentId: student.id })}>Approve</button>
                ) : (
                  <>
                    <button className="secondary-button" disabled={busy} onClick={() => void updateStudent({ action: "set-status", studentId: student.id, status: student.status === "active" ? "disabled" : "active" })}>
                      {student.status === "active" ? "Disable" : "Activate"}
                    </button>
                    <button className="secondary-button" disabled={busy} onClick={() => void updateStudent({ action: "reset-password", studentId: student.id })}>Reset password</button>
                  </>
                )}
              </div>
              {temporaryPassword?.studentId === student.id && (
                <div className="student-temp-password">
                  <span>Temporary password · <strong>{temporaryPassword.value}</strong> · student must change it after sign-in</span>
                  <button className="text-button" onClick={() => void navigator.clipboard.writeText(temporaryPassword.value).then(() => onToast("Temporary password copied."))}>Copy</button>
                </div>
              )}
              <details className="student-edit-details">
                <summary>Edit student details</summary>
                <StudentEditForm student={student} classes={classes} busy={busy} onSave={(changes) => void updateStudent({ action: "edit", studentId: student.id, ...changes })} />
              </details>
              <div className="student-admin-danger"><button className="text-button danger-text" disabled={busy} onClick={() => deleteStudent(student)}>Delete student and records</button></div>
              {student.status === "active" && (
                <details className="student-assignment-details">
                  <summary>Assigned examinations <span>{assignedCount}</span></summary>
                  {exams.length ? (
                    <div className="student-assignment-options">
                      {exams.map((exam) => {
                        const assignedByClass = exam.assignedClassIds?.includes(student.classId) || false
                        return <label key={exam.id}>
                          <input
                            type="checkbox"
                            checked={student.assignedExamIds.includes(exam.id) || assignedByClass}
                            disabled={busy || assignedByClass}
                            onChange={(event) => void updateStudent({ action: "assign", studentId: student.id, examId: exam.id, assigned: event.target.checked })}
                          />
                          <span><strong>{exam.title}</strong><small>{exam.subject} · {assignedByClass ? `Assigned to ${student.className}` : new Date(exam.startTime).toLocaleString()}</small></span>
                        </label>
                      })}
                    </div>
                  ) : <p className="student-no-exams">Create an examination before assigning one.</p>}
                </details>
              )}
            </article>
            )
          })}
        </section>
      )}
    </>
  )
}

function StudentEditForm({
  student,
  classes,
  busy,
  onSave,
}: {
  student: ManagedStudent
  classes: StudentClass[]
  busy: boolean
  onSave: (changes: { fullName: string; studentNumber: string; waecCandidateNumber: string; classId: string }) => void
}) {
  const [draft, setDraft] = useState({
    fullName: student.fullName,
    studentNumber: student.studentNumber,
    waecCandidateNumber: student.waecCandidateNumber || "",
    classId: student.classId,
  })
  return (
    <form className="student-edit-form" onSubmit={(event) => { event.preventDefault(); onSave(draft) }}>
      <label>Full name<input value={draft.fullName} onChange={(event) => setDraft((current) => ({ ...current, fullName: event.target.value }))} minLength={3} maxLength={100} required /></label>
      <label>Student ID<input value={draft.studentNumber} onChange={(event) => setDraft((current) => ({ ...current, studentNumber: event.target.value }))} minLength={2} maxLength={32} required /></label>
      <label>Class<select value={draft.classId} onChange={(event) => setDraft((current) => ({ ...current, classId: event.target.value }))} required><option value="">Select class</option>{classes.map((studentClass) => <option value={studentClass.id} key={studentClass.id}>{studentClass.name}</option>)}</select></label>
      <label>WAEC candidate number<input value={draft.waecCandidateNumber} onChange={(event) => setDraft((current) => ({ ...current, waecCandidateNumber: event.target.value }))} maxLength={32} /></label>
      <button className="secondary-button" disabled={busy}>Save student details</button>
    </form>
  )
}

function SettingsPage({ onToast }: { onToast: (message: string) => void }) {
  return (
    <>
      <div className="page-heading compact">
        <div>
          <span className="eyebrow">EXAMINATION PREFERENCES</span>
          <h1>Settings</h1>
          <p>Choose how your examinations feel for teachers and candidates.</p>
        </div>
      </div>
      <section className="settings-grid">
        <div className="panel settings-card">
          <span className="settings-icon blue"><UiIcon name="exam" /></span>
          <h2>Assessment defaults</h2>
          <p>
            New examinations start with a 60-minute duration and allow one
            candidate attempt. You can change these choices while creating an
            examination.
          </p>
          <div className="config-status">
            <i className="configured" />
            Ready for your next examination
          </div>
          <button className="secondary-button" onClick={() => onToast("Choose these options in Create an examination.")}>
            Create an examination <UiIcon name="chevron" />
          </button>
        </div>
        <div className="panel settings-card">
          <span className="settings-icon green"><UiIcon name="shield" /></span>
          <h2>Candidate protection</h2>
          <p>
            Camera checks help keep each examination fair. Candidates are
            clearly warned before an examination is locked.
          </p>
          <div className="config-status">
            <i className="configured" />
            Protection is ready
          </div>
        </div>
        <div className="panel settings-card">
          <span className="settings-icon purple"><UiIcon name="users" /></span>
          <h2>Candidate experience</h2>
          <p>
            Students sign in with their school ID and see only the examinations
            assigned to their account.
          </p>
          <div className="config-status">
            <i className="configured" />
            Ready to share
          </div>
        </div>
      </section>
    </>
  )
}

function CreateExamModal({
  onClose,
  onSave,
  initialExam,
}: {
  onClose: () => void
  onSave: (exam: PortalExam) => Promise<void>
  initialExam?: PortalExam
}) {
  const [title, setTitle] = useState(initialExam?.title || "")
  const [subject, setSubject] = useState(initialExam?.subject || "")
  const [classes, setClasses] = useState<StudentClass[]>([])
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>(initialExam?.assignedClassIds || [])
  const [classesLoading, setClassesLoading] = useState(true)
  const [startTime, setStartTime] = useState(() =>
    initialExam ? dateInput(new Date(initialExam.startTime)) : dateInput(new Date(Date.now() + 5 * 60_000)),
  )
  const [endTime, setEndTime] = useState(() =>
    initialExam ? dateInput(new Date(initialExam.endTime)) : dateInput(new Date(Date.now() + 3 * 60 * 60_000)),
  )
  const [duration, setDuration] = useState(initialExam?.durationMinutes || 60)
  const [warningSecs, setWarningSecs] = useState(initialExam?.lookAwayWarningSecs || 3)
  const [lockoutSecs, setLockoutSecs] = useState(initialExam?.lockoutThresholdSecs || 7)
  const [maxWarnings, setMaxWarnings] = useState(initialExam?.maxWarnings || 3)
  const [maxRetries, setMaxRetries] = useState(initialExam?.maxRetries || 2)
  const [maxAttempts, setMaxAttempts] = useState(initialExam?.maxAttempts || 1)
  const [gradeBands, setGradeBands] = useState<GradeBand[]>(
    initialExam?.gradeBands || defaultGradeBands,
  )
  const [photoUploadWindowMinutes, setPhotoUploadWindowMinutes] = useState(initialExam?.photoUploadWindowMinutes || 5)
  const [rawText, setRawText] = useState("")
  const [parsed, setParsed] = useState<Parsed | null>(
    initialExam ? { ...initialExam.questions } : null,
  )
  const [answerNotice, setAnswerNotice] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState<1 | 2>(initialExam ? 2 : 1)

  useEffect(() => {
    let mounted = true
    fetch("/api/classes", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || "Could not load classes.")
        if (mounted) setClasses(body.classes as StudentClass[])
      })
      .catch((cause) => {
        if (mounted) setError(cause instanceof Error ? cause.message : "Could not load classes.")
      })
      .finally(() => {
        if (mounted) setClassesLoading(false)
      })
    return () => { mounted = false }
  }, [])

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
      "AI is preparing the answer keys and marking guide. If Groq is busy, the app will wait and retry automatically…",
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
          photoUploadRecommended?: boolean
          photoUploadReason?: string
        }>
        error?: string
      }
      if (!response.ok)
        throw new Error(
          suggestions.error || "AI answer suggestions are unavailable.",
        )
      const suggestedIds = new Set(
        (suggestions.paper1 || []).map((suggestion) => suggestion.id),
      )
      const unansweredCount = parsed.paper1.filter(
        (question) => !question.correctOptionId && !suggestedIds.has(question.id),
      ).length
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
                photoUploadRecommended:
                  suggestion?.photoUploadRecommended ?? question.photoUploadRecommended ?? false,
                photoUploadReason:
                  suggestion?.photoUploadReason ?? question.photoUploadReason ?? "",
                allowPhotoUpload:
                  question.allowPhotoUpload ?? suggestion?.photoUploadRecommended ?? false,
              }
            }),
          },
      )
      setAnswerNotice(
        unansweredCount
          ? `AI filled the available answer keys and drafted the marking guides. ${unansweredCount} objective question${unansweredCount === 1 ? " still needs" : "s still need"} a key; retry AI generation or select the answer manually.`
          : "AI answer keys, marking guides, and handwriting upload suggestions are ready. Review and edit them before publishing.",
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
      setError(
        "An objective answer key is still missing. Retry AI answer generation or select the correct option manually.",
      )
      setStep(2)
      return
    }
    setBusy(true)
    setError("")
    try {
      const exam: PortalExam = {
        id: initialExam?.id || crypto.randomUUID(),
        title: title.trim(),
        subject: subject.trim(),
        accessCode: initialExam?.accessCode || "",
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        durationMinutes: duration,
        lookAwayWarningSecs: warningSecs,
        lockoutThresholdSecs: lockoutSecs,
        maxWarnings,
        maxRetries,
        maxAttempts,
        gradeBands,
        assignedClassIds: selectedClassIds,
        photoUploadWindowMinutes: parsed.paper2.some((question) => question.allowPhotoUpload)
          ? photoUploadWindowMinutes
          : 0,
        questions: parsed,
        attempts: initialExam?.attempts || [],
        createdAt: initialExam?.createdAt || new Date().toISOString(),
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
            <span className="eyebrow">{initialExam ? "EDIT PUBLISHED EXAMINATION" : "NEW WASSCE EXAMINATION"}</span>
            <h2 id="create-title">{initialExam ? "Edit examination" : "Create an examination"}</h2>
            <p>
              {initialExam
                ? "Update the schedule, settings, or questions for this examination."
                : "Set up the assessment and questions, then assign it to students."}
            </p>
          </div>
          <button className="close-button" onClick={onClose} aria-label="Close">
            <UiIcon name="close" />
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
                  <label>Student access</label>
                  <div className="access-preview">
                    Choose classes below for automatic access, or assign individual students after publishing. Students sign in with their school Student ID and password.
                  </div>
                </div>
              </div>
              <section className="exam-class-targeting" aria-labelledby="class-targeting-title">
                <div>
                  <strong id="class-targeting-title">Assign to classes</strong>
                  <p>Students in selected classes can take this exam. Students who join the class later will also receive it.</p>
                </div>
                {classesLoading ? (
                  <small className="student-form-help">Loading classes…</small>
                ) : classes.length ? (
                  <div className="exam-class-options">
                    {classes.map((studentClass) => (
                      <label key={studentClass.id}>
                        <input
                          type="checkbox"
                          checked={selectedClassIds.includes(studentClass.id)}
                          onChange={(event) => setSelectedClassIds((current) => event.target.checked
                            ? [...new Set([...current, studentClass.id])]
                            : current.filter((id) => id !== studentClass.id))}
                        />
                        <span>{studentClass.name}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="student-form-help">No classes exist yet. Leave this blank to assign students later from the Students page.</p>
                )}
                {classes.length > 0 && selectedClassIds.length === 0 && (
                  <small className="student-form-help">No class selected. You can assign this exam to individual students later.</small>
                )}
              </section>
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
              <div className="form-grid">
                <Field label="Allowed attempts per candidate">
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={maxAttempts}
                    onChange={(event) => setMaxAttempts(Number(event.target.value))}
                  />
                </Field>
                <div className="field">
                  <label>What this means</label>
                  <div className="access-preview">
                    Candidates can submit this many times.
                  </div>
                </div>
              </div>
              <div className="form-grid">
                <Field label="Handwritten answer upload window (minutes)">
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={photoUploadWindowMinutes}
                    onChange={(event) =>
                      setPhotoUploadWindowMinutes(Number(event.target.value))
                    }
                  />
                </Field>
                <div className="access-preview photo-window-help">
                  Opens after the student finishes the timed paper. Camera
                  checks pause while approved handwritten answers are uploaded.
                </div>
              </div>
              <div className="grading-section">
                <div className="section-divider">
                  <div>
                    <strong>Grade boundaries</strong>
                    <small>Set the percentage range for each letter grade.</small>
                  </div>
                </div>
                <div className="grade-band-grid">
                  {gradeBands.map((band, index) => (
                    <div className="grade-band" key={band.label}>
                      <strong>{band.label}</strong>
                      <input
                        aria-label={`${band.label} minimum percentage`}
                        type="number"
                        min={0}
                        max={100}
                        value={band.minimum}
                        onChange={(event) =>
                          setGradeBands((current) =>
                            adjustGradeBand(
                              current,
                              index,
                              "minimum",
                              Number(event.target.value),
                            ),
                          )
                        }
                      />
                      <span>to</span>
                      <input
                        aria-label={`${band.label} maximum percentage`}
                        type="number"
                        min={0}
                        max={100}
                        value={band.maximum}
                        onChange={(event) =>
                          setGradeBands((current) =>
                            adjustGradeBand(
                              current,
                              index,
                              "maximum",
                              Number(event.target.value),
                            ),
                          )
                        }
                      />
                      <span>%</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="section-divider">
                <div>
                  <strong>Add questions</strong>
                  <small>
                    Paste a WASSCE paper or numbered questions. Standard
                    objective and essay layouts are parsed locally; AI is used
                    for answer suggestions.
                  </small>
                </div>
                <span className="ai-tag">QUESTION IMPORT</span>
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
                  {busy ? "Parsing…" : "Parse questions"}
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
                  Generate AI answers & photo suggestions
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
                    <span>
                      {question.correctOptionId ? "KEY SELECTED" : "KEY NEEDED"} · {question.marks || 1} mark
                    </span>
                  </div>
                  <textarea
                    className="question-edit-prompt"
                    aria-label={`Question ${index + 1} text`}
                    value={question.stem}
                    onChange={(event) =>
                      setParsed((value) =>
                        value && {
                          ...value,
                          paper1: value.paper1.map((item) =>
                            item.id === question.id
                              ? { ...item, stem: event.target.value }
                              : item,
                          ),
                        },
                      )
                    }
                  />
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
                        <button
                          type="button"
                          className="option-key-button"
                          aria-label={`Set option ${option.label} as correct`}
                          onClick={() =>
                            setParsed((value) =>
                              value && {
                                ...value,
                                paper1: value.paper1.map((item) =>
                                  item.id === question.id
                                    ? { ...item, correctOptionId: option.id }
                                    : item,
                                ),
                              },
                            )
                          }
                        >
                          {question.correctOptionId === option.id ? "✓" : option.label}
                        </button>
                        <input
                          aria-label={`Option ${option.label} text`}
                          value={option.text}
                          onChange={(event) =>
                            setParsed((value) =>
                              value && {
                                ...value,
                                paper1: value.paper1.map((item) =>
                                  item.id === question.id
                                    ? {
                                        ...item,
                                        options: item.options.map((candidate) =>
                                          candidate.id === option.id
                                            ? { ...candidate, text: event.target.value }
                                            : candidate,
                                        ),
                                      }
                                    : item,
                                ),
                              },
                            )
                          }
                        />
                      </label>
                    ))}
                  </div>
                </article>
              ))}
              {parsed?.paper2.map((question, index) => (
                <article
                  className="question-review theory-review"
                  key={`paper2-${index}-${question.id || "question"}`}
                >
                  <div className="question-label">
                    PAPER 2 · QUESTION {index + 1}
                    <span>AI MODEL ANSWER · {question.marks} marks</span>
                  </div>
                  <textarea
                    className="question-edit-prompt"
                    aria-label={`Theory question ${index + 1} text`}
                    value={question.prompt}
                    onChange={(event) =>
                      setParsed((value) =>
                        value && {
                          ...value,
                          paper2: value.paper2.map((item) =>
                            item.id === question.id
                              ? { ...item, prompt: event.target.value }
                              : item,
                          ),
                        },
                      )
                    }
                  />
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
                  <div className="photo-review-setting">
                    <div>
                      <strong>AI handwriting suggestion</strong>
                      <small>
                        {question.photoUploadRecommended
                          ? question.photoUploadReason || "A photo may help show diagrams or working."
                          : "A typed response should work for this question."}
                      </small>
                    </div>
                    <label>
                      <input
                        type="checkbox"
                        checked={Boolean(question.allowPhotoUpload)}
                        onChange={(event) =>
                          setParsed((value) =>
                            value && {
                              ...value,
                              paper2: value.paper2.map((item) =>
                                item.id === question.id
                                  ? { ...item, allowPhotoUpload: event.target.checked }
                                  : item,
                              ),
                            },
                          )
                        }
                      />
                      Allow a handwritten photo answer
                    </label>
                  </div>
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
                <UiIcon name="chevron" />
              </button>
            ) : (
              <button type="submit" className="primary-button" disabled={busy}>
                {busy ? "Saving…" : initialExam ? "Save examination changes" : "Create & schedule exam"}
                <UiIcon name="chevron" />
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
            <UiIcon name="close" />
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
        <UiIcon name="plus" /> Add marking criterion
      </button>
    </div>
  )
}
