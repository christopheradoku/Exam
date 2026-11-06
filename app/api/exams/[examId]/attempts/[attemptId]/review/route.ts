import { NextRequest, NextResponse } from "next/server"
import { isTeacherRequest } from "../../../../../../../server/auth"
import { getExam, saveExam } from "../../../../../../../server/examStore"

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ examId: string; attemptId: string }> },
) {
  if (!isTeacherRequest(request))
    return NextResponse.json({ error: "Sign in required." }, { status: 401 })
  const { examId, attemptId } = await context.params
  const exam = await getExam(examId)
  if (!exam) return NextResponse.json({ error: "Exam not found." }, { status: 404 })
  const attempt = exam.attempts.find((item) => item.id === attemptId)
  if (!attempt || attempt.theoryScore === undefined)
    return NextResponse.json({ error: "An AI graded submission was not found." }, { status: 404 })
  attempt.teacherReviewed = true
  await saveExam(exam)
  return NextResponse.json({ ok: true })
}
