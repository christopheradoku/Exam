import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import type { StudentClass, StudentStatus } from "../src/lib/studentTypes"

export type StudentRecord = {
  id: string
  studentNumber: string
  waecCandidateNumber?: string
  fullName: string
  classId: string
  className: string
  passwordHash: string
  status: StudentStatus
  mustChangePassword: boolean
  assignedExamIds: string[]
  createdAt: string
  updatedAt: string
}

export type StudentSessionRecord = {
  id: string
  studentId: string
  tokenHash: string
  expiresAt: string
  createdAt: string
}

export type StudentStore = {
  students: StudentRecord[]
  sessions: StudentSessionRecord[]
  classes: StudentClass[]
}

const dataDir = path.join(process.cwd(), "data")
const dataFile = path.join(dataDir, "students.json")
let writeChain: Promise<void> = Promise.resolve()

async function readStore(): Promise<StudentStore> {
  try {
    const value = JSON.parse(await readFile(dataFile, "utf8")) as Partial<StudentStore>
    const store: StudentStore = {
      students: Array.isArray(value.students) ? value.students : [],
      sessions: Array.isArray(value.sessions) ? value.sessions : [],
      classes: Array.isArray(value.classes) ? value.classes : [],
    }
    for (const student of store.students) {
      let studentClass = store.classes.find((item) => item.id === student.classId)
      if (!studentClass && student.className?.trim()) {
        studentClass = store.classes.find(
          (item) => item.name.toLowerCase() === student.className.trim().toLowerCase(),
        )
        if (!studentClass) {
          studentClass = {
            id: randomUUID(),
            name: student.className.trim(),
            createdAt: student.createdAt || new Date().toISOString(),
          }
          store.classes.push(studentClass)
        }
        student.classId = studentClass.id
      }
      if (studentClass) student.className = studentClass.name
    }
    return store
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return { students: [], sessions: [], classes: [] }
    throw error
  }
}

async function writeStore(store: StudentStore) {
  await mkdir(dataDir, { recursive: true })
  const temporary = `${dataFile}.${randomUUID()}.tmp`
  await writeFile(temporary, JSON.stringify(store, null, 2), "utf8")
  await rename(temporary, dataFile)
}

export async function getStudentStore(): Promise<StudentStore> {
  await writeChain
  return readStore()
}

export async function updateStudentStore<T>(
  update: (store: StudentStore) => T | Promise<T>,
): Promise<T> {
  const operation = writeChain.then(async () => {
    const store = await readStore()
    const result = await update(store)
    await writeStore(store)
    return result
  })
  writeChain = operation.then(() => undefined, () => undefined)
  return operation
}

export function normalizeStudentNumber(value: string) {
  return value.trim().replace(/\s+/g, "").toUpperCase()
}

export function publicStudent(student: StudentRecord) {
  return {
    id: student.id,
    studentNumber: student.studentNumber,
    waecCandidateNumber: student.waecCandidateNumber || "",
    fullName: student.fullName,
    classId: student.classId,
    className: student.className,
    status: student.status,
    mustChangePassword: student.mustChangePassword,
    assignedExamIds: [...student.assignedExamIds],
    createdAt: student.createdAt,
  }
}
