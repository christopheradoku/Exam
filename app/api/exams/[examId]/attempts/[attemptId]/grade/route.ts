import { NextRequest, NextResponse } from "next/server"
import { gradeTheoryAnswers } from "../../../../../../../server/groq"
import { getExam, saveExam } from "../../../../../../../server/examStore"
import { isTeacherRequest } from "../../../../../../../server/auth"

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ examId: string; attemptId: string }> },
) {
  if (!isTeacherRequest(request))
    return NextResponse.json({ error: "Sign in required." }, { status: 401 })

  const { examId, attemptId } = await context.params
  const exam = await getExam(examId)
  if (!exam)
    return NextResponse.json({ error: "Exam not found." }, { status: 404 })

  const attempt = exam.attempts.find((item) => item.id === attemptId)
  if (!attempt)
    return NextResponse.json({ error: "Attempt not found." }, { status: 404 })
  if (!exam.questions.paper2.length)
    return NextResponse.json({ error: "This exam has no theory questions." }, { status: 400 })
  if (attempt.theoryScore !== undefined)
    return NextResponse.json({ attempt })

  try {
    const grades = await gradeTheoryAnswers(
      exam.questions.paper2,
      attempt.answers,
      attempt.photoAnswers || {},
    )
    if (!Array.isArray(grades) || grades.length !== exam.questions.paper2.length)
      throw new Error("The AI grader returned an incomplete theory result.")

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
    await saveExam(exam)
    return NextResponse.json({ attempt: { ...attempt, photoAnswers: undefined } })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The AI grader could not complete this submission.",
      },
      { status: 502 },
    )
  }
}
