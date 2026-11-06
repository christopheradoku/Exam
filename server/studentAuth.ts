import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto"
import type { NextRequest } from "next/server"
import type { StudentProfile } from "../src/lib/studentTypes"
import { getStudentStore, publicStudent, updateStudentStore } from "./studentStore"

const COOKIE_NAME = "wassce_student_session"
const NORMAL_SESSION_SECONDS = 60 * 60 * 12
const REMEMBERED_SESSION_SECONDS = 60 * 60 * 24 * 30

export function hashStudentPassword(password: string) {
  const salt = randomBytes(16).toString("hex")
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`
}

export function verifyStudentPassword(password: string, stored: string) {
  const [algorithm, salt, expectedHex] = stored.split("$")
  if (algorithm !== "scrypt" || !salt || !expectedHex) return false
  const expected = Buffer.from(expectedHex, "hex")
  if (expected.length !== 64) return false
  const actual = scryptSync(password, salt, expected.length)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export function studentSessionCookieName() {
  return COOKIE_NAME
}

export function studentSessionCookieOptions(remember: boolean) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: remember ? REMEMBERED_SESSION_SECONDS : NORMAL_SESSION_SECONDS,
  }
}

export function studentSessionClearCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: 0,
  }
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

export async function createStudentSession(studentId: string, remember: boolean) {
  const token = randomBytes(32).toString("base64url")
  const seconds = remember ? REMEMBERED_SESSION_SECONDS : NORMAL_SESSION_SECONDS
  const now = new Date()
  await updateStudentStore((store) => {
    store.sessions = store.sessions.filter(
      (session) => Date.parse(session.expiresAt) > now.getTime(),
    )
    store.sessions.push({
      id: randomBytes(16).toString("hex"),
      studentId,
      tokenHash: tokenHash(token),
      expiresAt: new Date(now.getTime() + seconds * 1000).toISOString(),
      createdAt: now.toISOString(),
    })
  })
  return token
}

export async function getStudentForRequest(
  request: NextRequest,
): Promise<(StudentProfile & { assignedExamIds: string[] }) | null> {
  const token = request.cookies.get(COOKIE_NAME)?.value
  if (!token) return null
  const hash = tokenHash(token)
  const store = await getStudentStore()
  const session = store.sessions.find((item) => item.tokenHash === hash)
  if (!session || Date.parse(session.expiresAt) <= Date.now()) return null
  const student = store.students.find(
    (item) => item.id === session.studentId && item.status === "active",
  )
  if (!student) return null
  return publicStudent(student)
}

export async function revokeStudentSession(token: string | undefined) {
  if (!token) return
  const hash = tokenHash(token)
  await updateStudentStore((store) => {
    store.sessions = store.sessions.filter((session) => session.tokenHash !== hash)
  })
}
