import { NextRequest, NextResponse } from "next/server"
import {
  createStudentSession,
  studentSessionCookieName,
  studentSessionCookieOptions,
  verifyStudentPassword,
} from "../../../../server/studentAuth"
import { getStudentStore, normalizeStudentNumber, publicStudent } from "../../../../server/studentStore"

type LoginBody = { studentNumber?: string; password?: string; remember?: boolean }

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as LoginBody | null
  const studentNumber = typeof body?.studentNumber === "string"
    ? normalizeStudentNumber(body.studentNumber)
    : ""
  const password = typeof body?.password === "string" ? body.password : ""
  if (!studentNumber || !password)
    return NextResponse.json({ error: "Enter your Student ID and password." }, { status: 400 })

  const store = await getStudentStore()
  const student = store.students.find((item) => item.studentNumber === studentNumber)
  if (!student || !verifyStudentPassword(password, student.passwordHash))
    return NextResponse.json({ error: "Student ID or password is incorrect." }, { status: 401 })
  if (student.status === "pending")
    return NextResponse.json({ error: "Your account is waiting for teacher approval." }, { status: 403 })
  if (student.status !== "active")
    return NextResponse.json({ error: "This student account is disabled. Contact your teacher." }, { status: 403 })

  const remember = body?.remember === true
  const token = await createStudentSession(student.id, remember)
  const response = NextResponse.json({ ok: true, student: publicStudent(student) })
  response.cookies.set(
    studentSessionCookieName(),
    token,
    studentSessionCookieOptions(remember),
  )
  return response
}
