import { NextRequest, NextResponse } from "next/server"
import { isTeacherRequest } from "../../../../server/auth"
import { getExam, listExams, replaceExams } from "../../../../server/examStore"

export async function GET(request: NextRequest, context: { params: Promise<{ examId: string }> }) {
  if (!isTeacherRequest(request)) return NextResponse.json({ error: "Sign in required." }, { status: 401 })
  const { examId } = await context.params
  const exam = await getExam(examId)
  if (!exam) return NextResponse.json({ error: "Exam not found." }, { status: 404 })
  return NextResponse.json({ exam })
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ examId: string }> }) {
  if (!isTeacherRequest(request)) return NextResponse.json({ error: "Sign in required." }, { status: 401 })
  const { examId } = await context.params
  const exams = await listExams()
  if (!exams.some((exam) => exam.id === examId)) return NextResponse.json({ error: "Exam not found." }, { status: 404 })
  await replaceExams(exams.filter((exam) => exam.id !== examId))
  return NextResponse.json({ ok: true })
}
