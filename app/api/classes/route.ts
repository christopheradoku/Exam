import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { isTeacherRequest } from "../../../server/auth"
import { getStudentStore, updateStudentStore } from "../../../server/studentStore"
import { listExams } from "../../../server/examStore"

export async function GET(request: NextRequest) {
  if (!isTeacherRequest(request))
    return NextResponse.json({ error: "Sign in required." }, { status: 401 })
  const store = await getStudentStore()
  return NextResponse.json({ classes: store.classes })
}

export async function POST(request: NextRequest) {
  if (!isTeacherRequest(request))
    return NextResponse.json({ error: "Sign in required." }, { status: 401 })
  const body = (await request.json().catch(() => null)) as { action?: string; name?: string; id?: string } | null
  if (body?.action === "create") {
    const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : ""
    if (name.length < 2 || name.length > 50)
      return NextResponse.json({ error: "Class name must be 2–50 characters." }, { status: 400 })
    try {
      const studentClass = await updateStudentStore((store) => {
        if (store.classes.some((item) => item.name.toLowerCase() === name.toLowerCase()))
          throw new Error("A class with that name already exists.")
        const created = { id: randomUUID(), name, createdAt: new Date().toISOString() }
        store.classes.push(created)
        return created
      })
      return NextResponse.json({ class: studentClass }, { status: 201 })
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create class." }, { status: 409 })
    }
  }

  if (body?.action === "delete") {
    if (!body.id) return NextResponse.json({ error: "Choose a class to delete." }, { status: 400 })
    try {
      if ((await listExams()).some((exam) => exam.assignedClassIds?.includes(body.id!)))
        throw new Error("Remove this class from its assigned examinations before deleting it.")
      await updateStudentStore((store) => {
        if (store.students.some((student) => student.classId === body.id))
          throw new Error("Move or delete the students in this class before deleting it.")
        const index = store.classes.findIndex((item) => item.id === body.id)
        if (index < 0) throw new Error("Class not found.")
        store.classes.splice(index, 1)
      })
      return NextResponse.json({ ok: true })
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Could not delete class." }, { status: 409 })
    }
  }

  return NextResponse.json({ error: "Unsupported class action." }, { status: 400 })
}
