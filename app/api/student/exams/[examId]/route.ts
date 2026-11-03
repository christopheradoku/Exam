import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { gradeTheoryAnswers } from "../../../../../server/groq"
import { getExam, saveExam } from "../../../../../server/examStore"
import type {
  ExamAttempt,
  PortalExam,
} from "../../../../../src/lib/portalTypes"
import { shuffleExamPayload } from "../../../../../src/lib/shuffleExamPayload"
import type { TheoryPart } from "../../../../../src/lib/examTypes"

type Body = {
  action?: "enter" | "submit" | "lockout"
  accessCode?: string
  candidateName?: string
  candidateNumber?: string
  answers?: Record<string, string>
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
  if (!body?.accessCode)
    return NextResponse.json(
      { error: "Enter the six-character access code." },
      { status: 400 },
    )
  const exam = await getExam(examId)
  if (!exam)
    return NextResponse.json({ error: "Exam not found." }, { status: 404 })
  if (body.accessCode.toUpperCase() !== exam.accessCode.toUpperCase())
    return NextResponse.json({ error: "Access code is not correct." }, {
      status: 401,
    })
  const gate = timeGate(exam)
  if (body.action === "enter" && gate === "early")
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
      },
      { status: 403 },
    )
  if (body.action === "enter" && gate === "closed")
    return NextResponse.json({ gate }, { status: 403 })

  if (body.action === "enter") {
    const candidateNumber = body.candidateNumber?.trim() || "anonymous"
    const priorLocks = exam.attempts.filter(
      (attempt) =>
        attempt.status === "locked" &&
        attempt.candidateNumber === candidateNumber,
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
              attempt.candidateNumber === candidateNumber &&
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
    return NextResponse.json({
      gate,
      exam: studentSafeExam(exam, questions),
      shuffleSeed,
      reshuffleCount: priorLocks.length,
    })
  }

  const candidateNumber = body.candidateNumber?.trim() || "anonymous"
  const attempt: ExamAttempt = {
    id: randomUUID(),
    candidateName: body.candidateName?.trim() || "Candidate",
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
  return NextResponse.json({
    attempt,
    paper2Pending:
      body.action === "submit" &&
      !!exam.questions.paper2.length &&
      attempt.theoryScore === undefined,
  })
}
