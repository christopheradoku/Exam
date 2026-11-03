import { createHmac, timingSafeEqual } from "node:crypto"
import type { NextRequest } from "next/server"

const COOKIE = "wassce_teacher_session"
const SESSION_SECONDS = 60 * 60 * 8

function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("hex")
}

export function teacherPassword() {
  return process.env.TEACHER_STATIC_PASSWORD
}

export function sessionCookieName() {
  return COOKIE
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: SESSION_SECONDS,
  }
}

export function createTeacherSession(secret: string) {
  const expires = `${Date.now() + SESSION_SECONDS * 1000}`
  return `${expires}.${sign(expires, secret)}`
}

export function isTeacherRequest(request: NextRequest) {
  const secret = teacherPassword()
  const value = request.cookies.get(COOKIE)?.value
  if (!secret || !value) return false
  const [expires, signature] = value.split(".")
  if (!expires || !signature || Number(expires) < Date.now()) return false
  const expected = sign(expires, secret)
  if (signature.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
}

export { SESSION_SECONDS }
