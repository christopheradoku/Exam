import { NextRequest, NextResponse } from "next/server"
import { createTeacherSession, sessionCookieName, sessionCookieOptions, teacherPassword } from "../../../../server/auth"

export async function POST(request: NextRequest) {
  const expectedPassword = teacherPassword()
  if (!expectedPassword) return NextResponse.json({ error: "Set TEACHER_STATIC_PASSWORD in .env.local, then restart the server." }, { status: 503 })
  let body: { password?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }) }
  if (body.password !== expectedPassword) return NextResponse.json({ error: "That password is not correct." }, { status: 401 })
  const response = NextResponse.json({ ok: true })
  response.cookies.set(sessionCookieName(), createTeacherSession(expectedPassword), sessionCookieOptions())
  return response
}
