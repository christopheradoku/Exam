import { NextRequest, NextResponse } from "next/server"
import { getStudentForRequest } from "../../../../server/studentAuth"
import { listExams } from "../../../../server/examStore"
import type { ExamAttempt, PortalExam } from "../../../../src/lib/portalTypes"
import { defaultGradeBands } from "../../../../src/lib/portalTypes"
import type { StudentAggregate, StudentExamAssignment } from "../../../../src/lib/studentTypes"

function belongsToStudent(attempt: ExamAttempt, studentId: string, studentNumber: string, waecCandidateNumber?: string) {
  return attempt.studentId === studentId ||
    (!attempt.studentId &&
      (attempt.candidateNumber === studentNumber ||
        (!!waecCandidateNumber && attempt.candidateNumber === waecCandidateNumber)))
}

function getAttemptGrade(exam: PortalExam, attempt: ExamAttempt) {
  if (attempt.theoryScore === undefined && exam.questions.paper2.length) return undefined
  const maximum = attempt.objectiveMax + (attempt.theoryMax || 0)
  if (!maximum) return undefined
  const score = attempt.objectiveScore + (attempt.theoryScore || 0)
  const percentage = (score / maximum) * 100
  return (exam.gradeBands || defaultGradeBands).find(
    (band) => percentage >= band.minimum && percentage <= band.maximum,
  )?.label
}

function aggregatePoints(percentage: number) {
  if (percentage >= 90) return 1
  if (percentage >= 80) return 2
  if (percentage >= 70) return 3
  if (percentage >= 60) return 4
  if (percentage >= 55) return 5
  if (percentage >= 50) return 6
  if (percentage >= 40) return 7
  if (percentage >= 30) return 8
  return 9
}

function isCoreSubject(subject: string, core: "english" | "mathematics") {
  const normalized = subject.toLowerCase().replace(/[^a-z]/g, "")
  return core === "english"
    ? normalized.includes("english")
    : normalized.includes("mathematics") || normalized === "math" || normalized.includes("mathematics")
}

function getStudentAggregate(
  exams: Array<PortalExam & { assignment: StudentExamAssignment }>,
): StudentAggregate | undefined {
  const results = exams.flatMap(({ subject, assignment }) => {
    const attempt = assignment.attempt
    if (!attempt || assignment.paper2Pending) return []
    const maximum = attempt.objectiveMax + (attempt.theoryMax || 0)
    if (!maximum) return []
    const score = attempt.objectiveScore + (attempt.theoryScore || 0)
    const percentage = (score / maximum) * 100
    return [{ subject, grade: attempt.grade || "—", points: aggregatePoints(percentage) }]
  })
  const uniqueResults = new Map<string, (typeof results)[number]>()
  for (const result of results) {
    const key = result.subject.trim().toLowerCase()
    const existing = uniqueResults.get(key)
    if (!existing || result.points < existing.points) uniqueResults.set(key, result)
  }
  const subjects = [...uniqueResults.values()]
  const selected: typeof subjects = []
  for (const core of ["english", "mathematics"] as const) {
    const index = subjects.findIndex((result) => isCoreSubject(result.subject, core))
    if (index >= 0) selected.push(subjects.splice(index, 1)[0])
  }
  selected.push(...subjects.sort((left, right) => left.points - right.points).slice(0, 6 - selected.length))
  if (!selected.length) return undefined
  return {
    total: selected.reduce((total, result) => total + result.points, 0),
    subjects: selected,
    complete: selected.length >= 6,
  }
}

function examAssignment(
  exam: PortalExam,
  student: { id: string; studentNumber: string; waecCandidateNumber?: string },
): StudentExamAssignment {
  const now = Date.now()
  const attempts = exam.attempts
    .filter((item) => belongsToStudent(item, student.id, student.studentNumber, student.waecCandidateNumber))
    .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt))
  const completedAttempts = attempts.filter((item) => item.status === "submitted" || item.status === "graded")
  const latest = completedAttempts[0]
  const maxAttempts = Math.max(1, Math.floor(Number(exam.maxAttempts) || 1))
  const attemptsUsed = completedAttempts.length
  const attemptsRemaining = Math.max(0, maxAttempts - attemptsUsed)
  const nowWithinExamWindow = now >= Date.parse(exam.startTime) && now <= Date.parse(exam.endTime)
  const start = exam.candidateStartTimes?.[student.id]
  const activeStart = Boolean(
    start && nowWithinExamWindow &&
    (!latest || Date.parse(start.startedAt) > Date.parse(latest.submittedAt)),
  )
  const canRetry = attemptsUsed > 0 && attemptsRemaining > 0 && nowWithinExamWindow && !activeStart
  let status: StudentExamAssignment["status"]
  if (activeStart) status = "in-progress"
  else if (latest?.status === "graded") status = "graded"
  else if (latest?.status === "submitted") status = "submitted"
  else {
    if (now < Date.parse(exam.startTime)) status = "upcoming"
    else if (now > Date.parse(exam.endTime)) status = "expired"
    else status = "ready"
  }
  const attempt = latest
    ? {
        id: latest.id,
        submittedAt: latest.submittedAt,
        objectiveScore: latest.objectiveScore,
        objectiveMax: latest.objectiveMax,
        theoryScore: latest.theoryScore,
        theoryMax: latest.theoryMax,
        status: latest.status,
        teacherReviewed: latest.teacherReviewed,
        grade: getAttemptGrade(exam, latest),
      }
    : undefined
  const attemptHistory = [...completedAttempts].reverse().map((item) => ({
    id: item.id,
    submittedAt: item.submittedAt,
    objectiveScore: item.objectiveScore,
    objectiveMax: item.objectiveMax,
    theoryScore: item.theoryScore,
    theoryMax: item.theoryMax,
    status: item.status as "submitted" | "graded",
    teacherReviewed: item.teacherReviewed,
    grade: getAttemptGrade(exam, item),
  }))
  return {
    id: exam.id,
    title: exam.title,
    subject: exam.subject,
    startTime: exam.startTime,
    endTime: exam.endTime,
    durationMinutes: exam.durationMinutes,
    status,
    attemptsUsed,
    maxAttempts,
    attemptsRemaining,
    canRetry,
    attemptHistory,
    attempt,
    paper2Pending: Boolean(attempt && exam.questions.paper2.length && attempt.theoryMax === undefined),
  }
}

export async function GET(request: NextRequest) {
  const student = await getStudentForRequest(request)
  if (!student) return NextResponse.json({ error: "Sign in to view your exams." }, { status: 401, headers: { "Cache-Control": "private, no-store" } })
  const assignedIds = new Set(student.assignedExamIds)
  const exams = (await listExams())
    .filter((exam) =>
      assignedIds.has(exam.id) ||
      exam.assignedClassIds?.includes(student.classId) ||
      exam.attempts.some((attempt) => belongsToStudent(attempt, student.id, student.studentNumber, student.waecCandidateNumber)),
    )
    .map((exam) => ({ ...examAssignment(exam, student), sourceExam: exam }))
    .sort((left, right) => Date.parse(left.startTime) - Date.parse(right.startTime))
  const aggregate = getStudentAggregate(exams.map(({ sourceExam, ...assignment }) => ({ ...sourceExam, assignment })))
  return NextResponse.json({ student, exams: exams.map(({ sourceExam, ...assignment }) => assignment), aggregate }, { headers: { "Cache-Control": "private, no-store" } })
}
