import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { hashStudentPassword } from "../../../../server/studentAuth"
import {
  normalizeStudentNumber,
  updateStudentStore,
  type StudentRecord,
} from "../../../../server/studentStore"

type RegistrationBody = {
  fullName?: string
  studentNumber?: string
  waecCandidateNumber?: string
  classId?: string
  password?: string
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as RegistrationBody | null
  if (!body)
    return NextResponse.json({ error: "Enter your details to register." }, { status: 400 })
  const fullName = typeof body.fullName === "string"
    ? body.fullName.trim().replace(/\s+/g, " ")
    : ""
  const studentNumber = typeof body.studentNumber === "string"
    ? normalizeStudentNumber(body.studentNumber)
    : ""
  const classId = typeof body.classId === "string" ? body.classId.trim() : ""
  const waecCandidateNumber = typeof body.waecCandidateNumber === "string"
    ? body.waecCandidateNumber.trim().replace(/\s+/g, "").toUpperCase()
    : ""
  const password = typeof body.password === "string" ? body.password : ""
  if (!fullName || fullName.length < 3 || fullName.length > 100)
    return NextResponse.json({ error: "Enter your full name (3–100 characters)." }, { status: 400 })
  if (studentNumber.length < 2 || studentNumber.length > 32)
    return NextResponse.json({ error: "Enter a valid school Student ID." }, { status: 400 })
  if (!classId)
    return NextResponse.json({ error: "Choose a class from the school list." }, { status: 400 })
  if (waecCandidateNumber && waecCandidateNumber.length > 32)
    return NextResponse.json({ error: "The WAEC candidate number is too long." }, { status: 400 })
  if (password.length < 8 || password.length > 128)
    return NextResponse.json({ error: "Choose a password between 8 and 128 characters." }, { status: 400 })

  const now = new Date().toISOString()
  const student: StudentRecord = {
    id: randomUUID(),
    studentNumber,
    waecCandidateNumber: waecCandidateNumber || undefined,
    fullName,
    classId,
    className: "",
    passwordHash: hashStudentPassword(password),
    status: "pending",
    mustChangePassword: false,
    assignedExamIds: [],
    createdAt: now,
    updatedAt: now,
  }
  try {
    await updateStudentStore((store) => {
      const studentClass = store.classes.find((item) => item.id === classId)
      if (!studentClass) throw new Error("That class is no longer available. Refresh the page and choose another.")
      if (store.students.some((item) => item.studentNumber === studentNumber))
        throw new Error("An account already uses that Student ID. Ask your teacher for help.")
      if (waecCandidateNumber && store.students.some((item) => item.waecCandidateNumber === waecCandidateNumber))
        throw new Error("An account already uses that WAEC candidate number. Ask your teacher for help.")
      student.className = studentClass.name
      store.students.push(student)
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create your account." },
      { status: 409 },
    )
  }
  return NextResponse.json(
    { ok: true, message: "Registration received. Your teacher must approve your account before you can sign in." },
    { status: 201 },
  )
}
