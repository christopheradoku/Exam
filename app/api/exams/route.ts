import { randomInt } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { isTeacherRequest } from "../../../server/auth"
import { listExams, saveExam } from "../../../server/examStore"
import { getStudentStore } from "../../../server/studentStore"
import type { PortalExam } from "../../../src/lib/portalTypes"

export async function GET(request: NextRequest) {
  if (!isTeacherRequest(request)) return NextResponse.json({ error: "Sign in required." }, { status: 401 })
  return NextResponse.json({ exams: await listExams() })
}

export async function POST(request: NextRequest) {
  if (!isTeacherRequest(request)) return NextResponse.json({ error: "Sign in required." }, { status: 401 })
  let exam: PortalExam
  try { exam = await request.json() as PortalExam } catch { return NextResponse.json({ error: "Invalid exam data." }, { status: 400 }) }
  if (!exam.id || !exam.title?.trim() || !exam.startTime || !exam.endTime || !exam.questions) {
    return NextResponse.json({ error: "Complete the required exam details." }, { status: 400 })
  }
  const classIds = Array.isArray(exam.assignedClassIds) ? [...new Set(exam.assignedClassIds.filter((id) => typeof id === "string"))] : []
  const { classes } = await getStudentStore()
  if (classIds.some((id) => !classes.some((studentClass) => studentClass.id === id)))
    return NextResponse.json({ error: "One of the selected classes no longer exists. Refresh the page and try again." }, { status: 400 })
  exam.assignedClassIds = classIds
  const current = await listExams()
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let accessCode = ""
  do { accessCode = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join("") }
  while (current.some((item) => item.accessCode === accessCode))
  exam.accessCode = accessCode
  await saveExam(exam)
  return NextResponse.json({ exam }, { status: 201 })
}
