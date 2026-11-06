import { randomBytes, randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { isTeacherRequest } from "../../../server/auth"
import { hashStudentPassword } from "../../../server/studentAuth"
import { getExam, listExams, replaceExams } from "../../../server/examStore"
import { getStudentStore, normalizeStudentNumber, publicStudent, updateStudentStore } from "../../../server/studentStore"

type MutationBody = {
  action?: "approve" | "set-status" | "assign" | "assign-class" | "reset-password" | "edit" | "delete" | "create"
  studentId?: string
  examId?: string
  classId?: string
  assigned?: boolean
  status?: "active" | "disabled"
  fullName?: string
  studentNumber?: string
  waecCandidateNumber?: string
}

export async function GET(request: NextRequest) {
  if (!isTeacherRequest(request))
    return NextResponse.json({ error: "Sign in required." }, { status: 401 })
  const store = await getStudentStore()
  return NextResponse.json({ students: store.students.map(publicStudent) })
}

export async function POST(request: NextRequest) {
  if (!isTeacherRequest(request))
    return NextResponse.json({ error: "Sign in required." }, { status: 401 })
  const body = (await request.json().catch(() => null)) as MutationBody | null
  if (!body?.action)
    return NextResponse.json({ error: "Choose a student management action." }, { status: 400 })

  if (body.action === "delete") {
    if (!body.studentId)
      return NextResponse.json({ error: "Choose a student to delete." }, { status: 400 })
    const existingStore = await getStudentStore()
    const studentToDelete = existingStore.students.find((item) => item.id === body.studentId)
    if (!studentToDelete)
      return NextResponse.json({ error: "Student account not found." }, { status: 404 })
    try {
      await updateStudentStore((store) => {
        const student = store.students.find((item) => item.id === body.studentId)
        if (!student) throw new Error("Student account not found.")
        student.status = "disabled"
        student.updatedAt = new Date().toISOString()
        store.sessions = store.sessions.filter((session) => session.studentId !== student.id)
      })
      const identifiers = new Set(
        [studentToDelete.studentNumber, studentToDelete.waecCandidateNumber || ""].filter(Boolean),
      )
      const exams = await listExams()
      let attemptsRemoved = 0
      for (const exam of exams) {
        const before = exam.attempts.length
        exam.attempts = exam.attempts.filter((attempt) =>
          attempt.studentId !== studentToDelete.id &&
          (Boolean(attempt.studentId) || !identifiers.has(attempt.candidateNumber)),
        )
        attemptsRemoved += before - exam.attempts.length
        for (const key of [studentToDelete.id, ...identifiers]) {
          delete exam.candidateStartTimes?.[key]
          delete exam.photoUploadWindows?.[key]
        }
      }
      await replaceExams(exams)
      await updateStudentStore((store) => {
        store.students = store.students.filter((student) => student.id !== body.studentId)
        store.sessions = store.sessions.filter((session) => session.studentId !== body.studentId)
      })
      return NextResponse.json({ ok: true, attemptsRemoved })
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Could not delete student account." },
        { status: 500 },
      )
    }
  }

  if (body.action === "create") {
    const fullName = typeof body.fullName === "string" ? body.fullName.trim().replace(/\s+/g, " ") : ""
    const studentNumber = typeof body.studentNumber === "string" ? normalizeStudentNumber(body.studentNumber) : ""
    const waecCandidateNumber = typeof body.waecCandidateNumber === "string"
      ? body.waecCandidateNumber.trim().replace(/\s+/g, "").toUpperCase()
      : ""
    if (fullName.length < 3 || fullName.length > 100)
      return NextResponse.json({ error: "Enter the student's full name (3–100 characters)." }, { status: 400 })
    if (studentNumber.length < 2 || studentNumber.length > 32)
      return NextResponse.json({ error: "Enter a valid school Student ID." }, { status: 400 })
    if (!body.classId)
      return NextResponse.json({ error: "Choose a class from the school list." }, { status: 400 })
    if (waecCandidateNumber.length > 32)
      return NextResponse.json({ error: "The WAEC candidate number is too long." }, { status: 400 })
    const temporaryPassword = randomBytes(6).toString("base64url")
    try {
      const student = await updateStudentStore((store) => {
        const studentClass = store.classes.find((item) => item.id === body.classId)
        if (!studentClass) throw new Error("Choose an available class.")
        if (store.students.some((item) => item.studentNumber === studentNumber))
          throw new Error("An account already uses that Student ID.")
        if (waecCandidateNumber && store.students.some((item) => item.waecCandidateNumber === waecCandidateNumber))
          throw new Error("An account already uses that WAEC candidate number.")
        const now = new Date().toISOString()
        const record = {
          id: randomUUID(),
          studentNumber,
          waecCandidateNumber: waecCandidateNumber || undefined,
          fullName,
          classId: studentClass.id,
          className: studentClass.name,
          passwordHash: hashStudentPassword(temporaryPassword),
          status: "active" as const,
          mustChangePassword: true,
          assignedExamIds: [] as string[],
          createdAt: now,
          updatedAt: now,
        }
        store.students.push(record)
        return publicStudent(record)
      })
      return NextResponse.json({ student, temporaryPassword }, { status: 201 })
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Could not add student." }, { status: 409 })
    }
  }

  if (body.action === "assign" || body.action === "assign-class") {
    if (!body.examId || typeof body.assigned !== "boolean")
      return NextResponse.json({ error: "Choose an examination and assignment state." }, { status: 400 })
    if (!(await getExam(body.examId)))
      return NextResponse.json({ error: "Examination not found." }, { status: 404 })
  }

  if (body.action === "assign-class" && !body.classId?.trim())
    return NextResponse.json({ error: "Choose a class to update." }, { status: 400 })

  try {
    const result = await updateStudentStore((store) => {
      const now = new Date().toISOString()
      if (body.action === "assign-class") {
        const members = store.students.filter(
          (student) =>
            student.classId === body.classId &&
            student.status === "active",
        )
        for (const student of members) {
          const hasAssignment = student.assignedExamIds.includes(body.examId!)
          if (body.assigned && !hasAssignment) student.assignedExamIds.push(body.examId!)
          if (!body.assigned && hasAssignment)
            student.assignedExamIds = student.assignedExamIds.filter((id) => id !== body.examId)
          student.updatedAt = now
        }
        return { count: members.length }
      }

      const student = store.students.find((item) => item.id === body.studentId)
      if (!student) throw new Error("Student account not found.")
      if (body.action === "approve") {
        if (student.status !== "pending") throw new Error("Only pending registrations can be approved.")
        student.status = "active"
      } else if (body.action === "set-status") {
        if (body.status !== "active" && body.status !== "disabled")
          throw new Error("Choose whether to activate or disable this account.")
        student.status = body.status
        if (body.status === "disabled")
          store.sessions = store.sessions.filter((session) => session.studentId !== student.id)
      } else if (body.action === "assign") {
        if (student.status !== "active") throw new Error("Approve the student before assigning exams.")
        const hasAssignment = student.assignedExamIds.includes(body.examId!)
        if (body.assigned && !hasAssignment) student.assignedExamIds.push(body.examId!)
        if (!body.assigned && hasAssignment)
          student.assignedExamIds = student.assignedExamIds.filter((id) => id !== body.examId)
      } else if (body.action === "edit") {
        const fullName = typeof body.fullName === "string" ? body.fullName.trim().replace(/\s+/g, " ") : ""
        const studentNumber = typeof body.studentNumber === "string" ? normalizeStudentNumber(body.studentNumber) : ""
        const waecCandidateNumber = typeof body.waecCandidateNumber === "string"
          ? body.waecCandidateNumber.trim().replace(/\s+/g, "").toUpperCase()
          : ""
        const studentClass = store.classes.find((item) => item.id === body.classId)
        if (fullName.length < 3 || fullName.length > 100)
          throw new Error("Enter the student's full name (3–100 characters).")
        if (studentNumber.length < 2 || studentNumber.length > 32)
          throw new Error("Enter a valid school Student ID.")
        if (!studentClass) throw new Error("Choose a class from the school list.")
        if (waecCandidateNumber.length > 32)
          throw new Error("The WAEC candidate number is too long.")
        if (store.students.some((item) => item.id !== student.id && item.studentNumber === studentNumber))
          throw new Error("Another account already uses that Student ID.")
        if (waecCandidateNumber && store.students.some((item) => item.id !== student.id && item.waecCandidateNumber === waecCandidateNumber))
          throw new Error("Another account already uses that WAEC candidate number.")
        student.fullName = fullName
        student.studentNumber = studentNumber
        student.waecCandidateNumber = waecCandidateNumber || undefined
        student.classId = studentClass.id
        student.className = studentClass.name
      } else if (body.action === "reset-password") {
        const temporaryPassword = randomBytes(6).toString("base64url")
        student.passwordHash = hashStudentPassword(temporaryPassword)
        student.mustChangePassword = true
        store.sessions = store.sessions.filter((session) => session.studentId !== student.id)
        student.updatedAt = now
        return { student: publicStudent(student), temporaryPassword }
      } else {
        throw new Error("Unsupported student management action.")
      }
      student.updatedAt = now
      return { student: publicStudent(student) }
    })
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update the student account." },
      { status: 400 },
    )
  }
}
