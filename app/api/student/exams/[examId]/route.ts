import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { getStudentForRequest } from "../../../../../server/studentAuth"
import { gradeTheoryAnswers } from "../../../../../server/groq"
import { getExam, saveExam } from "../../../../../server/examStore"
import type {
  ExamAttempt,
  PortalExam,
} from "../../../../../src/lib/portalTypes"
import { defaultGradeBands } from "../../../../../src/lib/portalTypes"
import { shuffleExamPayload } from "../../../../../src/lib/shuffleExamPayload"
import type { TheoryPart } from "../../../../../src/lib/examTypes"

type Body = {
  action?: "enter" | "start" | "submit" | "lockout" | "open-photo-upload"
  accessCode?: string
  candidateName?: string
  candidateNumber?: string
  answers?: Record<string, string>
  photoAnswers?: Record<string, string>
  warnings?: number
  reshuffleCount?: number
  shuffleSeed?: string
}

function safeTheoryQuestion(question: TheoryPart): TheoryPart {
  const { expectedAnswer: _answer, rubric: _rubric, ...safe } = question
  return { ...safe, parts: question.parts?.map(safeTheoryQuestion) }
}

function studentSafeExam(exam: PortalExam, questions = exam.questions) {
  return {
    id: exam.id,
    title: exam.title,
    subject: exam.subject,
    startTime: exam.startTime,
    endTime: exam.endTime,
    durationMinutes: exam.durationMinutes,
    lookAwayWarningSecs: exam.lookAwayWarningSecs,
    lockoutThresholdSecs: exam.lockoutThresholdSecs,
    maxWarnings: exam.maxWarnings,
    maxRetries: exam.maxRetries,
    maxAttempts: exam.maxAttempts,
    gradeBands: exam.gradeBands ?? defaultGradeBands,
    photoUploadWindowMinutes: exam.photoUploadWindowMinutes || 0,
    questions: {
      paper1: questions.paper1.map(
        ({ correctOptionId: _answer, ...question }) => question,
      ),
      paper2: questions.paper2.map(safeTheoryQuestion),
    },
  }
}

function timeGate(exam: PortalExam) {
  const now = Date.now()
  if (now < Date.parse(exam.startTime)) return "early"
  if (now > Date.parse(exam.endTime)) return "closed"
  return "open"
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ examId: string }> },
) {
  const { examId } = await context.params
  const body = (await request.json().catch(() => null)) as Body | null
  if (!body)
    return NextResponse.json(
      { error: "Invalid exam request." },
      { status: 400 },
    )
  if (!body.action || !["enter", "start", "submit", "lockout", "open-photo-upload"].includes(body.action))
    return NextResponse.json({ error: "Unsupported exam action." }, { status: 400 })
  const student = await getStudentForRequest(request)
  if (!student)
    return NextResponse.json({ error: "Sign in to your student account first." }, { status: 401 })
  const exam = await getExam(examId)
  if (!exam)
    return NextResponse.json({ error: "Exam not found." }, { status: 404 })
  if (!student.assignedExamIds.includes(examId) && !exam.assignedClassIds?.includes(student.classId))
    return NextResponse.json({ error: "This examination has not been assigned to your account." }, { status: 403 })
  const belongsToStudent = (attempt: ExamAttempt) =>
    attempt.studentId === student.id ||
    (!attempt.studentId &&
      (attempt.candidateNumber === student.studentNumber ||
        (!!student.waecCandidateNumber && attempt.candidateNumber === student.waecCandidateNumber)))
  const candidateNumber = student.waecCandidateNumber || student.studentNumber
  if (body.action === "open-photo-upload") {
    const duration = Math.min(30, Math.max(0, exam.photoUploadWindowMinutes || 0))
    const allowedIds = new Set(exam.questions.paper2.filter((question) => question.allowPhotoUpload).map((question) => question.id))
    if (!duration || !allowedIds.size)
      return NextResponse.json({ error: "This exam has no handwritten photo answers enabled." }, { status: 400 })
    const key = student.id
    if (exam.attempts.some((attempt) => belongsToStudent(attempt) && (attempt.status === "submitted" || attempt.status === "graded")))
      return NextResponse.json({ error: "This candidate has already submitted this examination." }, { status: 403 })
    const examStart = exam.candidateStartTimes?.[key]
    if (!examStart)
      return NextResponse.json({ error: "The timed exam has not been started for this candidate." }, { status: 403 })
    const examDeadline = Date.parse(examStart.deadlineAt)
    if (Date.now() < examDeadline)
      return NextResponse.json({ error: "The handwritten upload window opens when the exam timer ends." }, { status: 403 })
    if (Date.now() > examDeadline + duration * 60_000 + 30_000)
      return NextResponse.json({ error: "The handwritten answer upload window has expired." }, { status: 403 })
    exam.photoUploadWindows ||= {}
    const existing = exam.photoUploadWindows[key]
    if (existing && Date.now() > Date.parse(existing.closesAt) + 30_000)
      return NextResponse.json({ error: "The handwritten upload window has expired." }, { status: 403 })
    const window = existing || {
      openedAt: examStart.deadlineAt,
      closesAt: new Date(examDeadline + duration * 60_000).toISOString(),
    }
    exam.photoUploadWindows[key] = window
    await saveExam(exam)
    return NextResponse.json(window)
  }
  const gate = timeGate(exam)
  if ((body.action === "enter" || body.action === "start") && gate === "early")
    return NextResponse.json(
      {
        gate,
        startTime: exam.startTime,
        endTime: exam.endTime,
        title: exam.title,
        subject: exam.subject,
        durationMinutes: exam.durationMinutes,
        lookAwayWarningSecs: exam.lookAwayWarningSecs,
        lockoutThresholdSecs: exam.lockoutThresholdSecs,
        maxWarnings: exam.maxWarnings,
        maxRetries: exam.maxRetries,
        maxAttempts: exam.maxAttempts,
        gradeBands: exam.gradeBands ?? defaultGradeBands,
        photoUploadWindowMinutes: exam.photoUploadWindowMinutes || 0,
      },
      { status: 403 },
    )
  if ((body.action === "enter" || body.action === "start") && gate === "closed")
    return NextResponse.json({ gate }, { status: 403 })

  if (body.action === "enter" || body.action === "start") {
    const completedAttempts = exam.attempts.filter(
      (attempt) =>
        belongsToStudent(attempt) &&
        (attempt.status === "submitted" || attempt.status === "graded"),
    ).length
    if (completedAttempts >= (exam.maxAttempts ?? 1))
      return NextResponse.json(
        { error: "The allowed number of attempts has been used.", gate: "closed" },
        { status: 403 },
      )
    const priorLocks = exam.attempts.filter(
      (attempt) =>
        attempt.status === "locked" &&
        belongsToStudent(attempt),
    )
    if (priorLocks.length > exam.maxRetries)
      return NextResponse.json(
        { error: "No re-entry attempts remain.", gate: "locked" },
        { status: 403 },
      )
    let questions = exam.questions
    let shuffleSeed: string | undefined
    if (priorLocks.length) {
      shuffleSeed = randomUUID()
      const previousSeeds = [
        "__original__",
        ...exam.attempts
          .filter(
            (attempt) =>
              belongsToStudent(attempt) &&
              attempt.shuffleSeed,
          )
          .map((attempt) => attempt.shuffleSeed!),
      ]
      questions = shuffleExamPayload(
        { examId: exam.id, ...exam.questions },
        shuffleSeed,
        previousSeeds,
      )
    }
    let deadlineAt: string | undefined
    if (body.action === "start") {
      const key = student.id
      exam.candidateStartTimes ||= {}
      const start = exam.candidateStartTimes[key]
      if (!start) {
        const startedAt = Date.now()
        deadlineAt = new Date(Math.min(startedAt + exam.durationMinutes * 60_000, Date.parse(exam.endTime))).toISOString()
        exam.candidateStartTimes[key] = { startedAt: new Date(startedAt).toISOString(), deadlineAt }
        await saveExam(exam)
      } else {
        deadlineAt = start.deadlineAt
      }
    }
    return NextResponse.json({
      gate,
      exam: studentSafeExam(
        exam,
        body.action === "start" ? questions : { paper1: [], paper2: [] },
      ),
      shuffleSeed,
      reshuffleCount: priorLocks.length,
      deadlineAt,
    })
  }

  if (body.action === "lockout") {
    if (!exam.candidateStartTimes?.[student.id])
      return NextResponse.json({ error: "This exam attempt has not been started." }, { status: 403 })
    delete exam.candidateStartTimes?.[student.id]
    delete exam.photoUploadWindows?.[student.id]
  }
  const attempt: ExamAttempt = {
    id: randomUUID(),
    studentId: student.id,
    candidateName: student.fullName,
    candidateNumber,
    submittedAt: new Date().toISOString(),
    objectiveScore: 0,
    objectiveMax: exam.questions.paper1.reduce(
      (total, q) => total + (q.marks || 1),
      0,
    ),
    status: body.action === "lockout" ? "locked" : "submitted",
    warnings: body.warnings || 0,
    reshuffleCount: body.reshuffleCount || 0,
    shuffleSeed: body.shuffleSeed,
    answers: body.answers || {},
  }
  if (body.action === "submit") {
    if (!exam.candidateStartTimes?.[student.id])
      return NextResponse.json({ error: "Start the assigned exam before submitting it." }, { status: 403 })
    if (exam.attempts.some((attempt) => belongsToStudent(attempt) && (attempt.status === "submitted" || attempt.status === "graded")))
      return NextResponse.json({ error: "This candidate has already submitted this examination." }, { status: 403 })
    const allowedPhotoIds = new Set(exam.questions.paper2.filter((question) => question.allowPhotoUpload).map((question) => question.id))
    const photos = body.photoAnswers || {}
    const hasPhotoFeature = allowedPhotoIds.size > 0 && (exam.photoUploadWindowMinutes || 0) > 0
    const uploadWindow = exam.photoUploadWindows?.[student.id]
    if (hasPhotoFeature && (!uploadWindow || Date.now() > Date.parse(uploadWindow.closesAt) + 30_000))
      return NextResponse.json({ error: "The handwritten answer upload window is missing or has expired." }, { status: 403 })
    for (const [questionId, dataUrl] of Object.entries(photos)) {
      if (!allowedPhotoIds.has(questionId) || typeof dataUrl !== "string" || !/^data:image\/(jpeg|png|webp);base64,/.test(dataUrl) || dataUrl.length > 1_500_000)
        return NextResponse.json({ error: "A photo is invalid, too large, or not allowed for this question." }, { status: 400 })
    }
    attempt.photoAnswers = photos
    const presented = body.shuffleSeed
      ? shuffleExamPayload(
          { examId: exam.id, ...exam.questions },
          body.shuffleSeed,
          [],
        )
      : exam.questions
    attempt.objectiveScore = presented.paper1.reduce(
      (total, q) =>
        total +
        (q.correctOptionId && body.answers?.[q.id] === q.correctOptionId
          ? q.marks || 1
          : 0),
      0,
    )
    attempt.objectiveMax = presented.paper1.reduce(
      (total, q) => total + (q.marks || 1),
      0,
    )
    if (presented.paper2.length) {
      try {
        const grades = await gradeTheoryAnswers(
          presented.paper2,
          body.answers || {},
          photos,
        )
        attempt.theoryScore = grades.reduce(
          (total, grade) => total + grade.awardedMarks,
          0,
        )
        attempt.theoryMax = grades.reduce(
          (total, grade) => total + grade.maxMarks,
          0,
        )
        attempt.theoryReport = grades
        attempt.status = "graded"
      } catch {
        // Keep objective results immediately; paper 2 remains visibly pending.
      }
    }
  }
  exam.attempts.push(attempt)
  await saveExam(exam)
  const studentAttempt = { ...attempt, photoAnswers: undefined }
  return NextResponse.json({
    attempt: studentAttempt,
    paper2Pending:
      body.action === "submit" &&
      !!exam.questions.paper2.length &&
      attempt.theoryScore === undefined,
  })
}
