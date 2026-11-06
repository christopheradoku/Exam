import { NextRequest, NextResponse } from "next/server"
import { getStudentForRequest, hashStudentPassword } from "../../../../server/studentAuth"
import { updateStudentStore } from "../../../../server/studentStore"

export async function POST(request: NextRequest) {
  const student = await getStudentForRequest(request)
  if (!student) return NextResponse.json({ error: "Sign in to change your password." }, { status: 401 })
  const body = (await request.json().catch(() => null)) as { password?: string } | null
  const password = typeof body?.password === "string" ? body.password : ""
  if (password.length < 8 || password.length > 128)
    return NextResponse.json({ error: "Choose a password between 8 and 128 characters." }, { status: 400 })
  await updateStudentStore((store) => {
    const record = store.students.find((item) => item.id === student.id)
    if (!record || record.status !== "active") throw new Error("Student account is unavailable.")
    record.passwordHash = hashStudentPassword(password)
    record.mustChangePassword = false
    record.updatedAt = new Date().toISOString()
  })
  return NextResponse.json({ ok: true })
}
