import { NextRequest, NextResponse } from "next/server"
import { isTeacherRequest } from "../../../../server/auth"
import { getExam, listExams, replaceExams, saveExam } from "../../../../server/examStore"
import type { PortalExam } from "../../../../src/lib/portalTypes"

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

export async function PUT(request: NextRequest, context: { params: Promise<{ examId: string }> }) {
  if (!isTeacherRequest(request)) return NextResponse.json({ error: "Sign in required." }, { status: 401 })
  const { examId } = await context.params
  const existing = await getExam(examId)
  if (!existing) return NextResponse.json({ error: "Exam not found." }, { status: 404 })
  let changes: Partial<PortalExam>
  try {
    changes = await request.json() as Partial<PortalExam>
  } catch {
    return NextResponse.json({ error: "Invalid exam data." }, { status: 400 })
  }
  if (!changes.title?.trim() || !changes.subject?.trim() || !changes.startTime || !changes.endTime || !changes.questions) {
    return NextResponse.json({ error: "Complete the required exam details." }, { status: 400 })
  }
  const updated: PortalExam = {
    ...existing,
    ...changes,
    id: existing.id,
    accessCode: existing.accessCode,
    attempts: existing.attempts,
    createdAt: existing.createdAt,
  }
  await saveExam(updated)
  return NextResponse.json({ exam: updated })
}
