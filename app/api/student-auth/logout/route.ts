import { NextRequest, NextResponse } from "next/server"
import {
  revokeStudentSession,
  studentSessionClearCookieOptions,
  studentSessionCookieName,
} from "../../../../server/studentAuth"

export async function POST(request: NextRequest) {
  await revokeStudentSession(request.cookies.get(studentSessionCookieName())?.value)
  const response = NextResponse.json({ ok: true })
  response.cookies.set(studentSessionCookieName(), "", studentSessionClearCookieOptions())
  return response
}
