import { NextRequest, NextResponse } from "next/server"
import { getStudentForRequest } from "../../../../server/studentAuth"
import { listExams } from "../../../../server/examStore"
import type { ExamAttempt, PortalExam } from "../../../../src/lib/portalTypes"
import { defaultGradeBands } from "../../../../src/lib/portalTypes"
import type { StudentExamAssignment } from "../../../../src/lib/studentTypes"

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
    .map((exam) => examAssignment(exam, student))
    .sort((left, right) => Date.parse(left.startTime) - Date.parse(right.startTime))
  return NextResponse.json({ student, exams }, { headers: { "Cache-Control": "private, no-store" } })
}
