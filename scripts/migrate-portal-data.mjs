import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { neon } from "@neondatabase/serverless"

const connectionString = [process.env.DATABASE_URL, process.env.POSTGRES_URL, process.env.NEON_DATABASE_URL]
  .map((value) => value?.trim())
  .find((value) => value && /^postgres(?:ql)?:\/\//i.test(value))

if (!connectionString) {
  console.error("Set DATABASE_URL to your Neon Postgres connection string before importing data.")
  process.exit(1)
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"))
  } catch (error) {
    if (error?.code === "ENOENT") return fallback
    throw error
  }
}

const root = process.cwd()
const exams = await readJson(path.join(root, "data", "exams.json"), [])
const studentStore = await readJson(path.join(root, "data", "students.json"), {
  students: [],
  sessions: [],
  classes: [],
})
studentStore.students ??= []
studentStore.sessions ??= []
studentStore.classes ??= []

for (const student of studentStore.students) {
  let studentClass = studentStore.classes.find((item) => item.id === student.classId)
  if (!studentClass && student.className?.trim()) {
    studentClass = studentStore.classes.find(
      (item) => item.name.toLowerCase() === student.className.trim().toLowerCase(),
    )
    if (!studentClass) {
      studentClass = {
        id: student.classId || randomUUID(),
        name: student.className.trim(),
        createdAt: student.createdAt || new Date().toISOString(),
      }
      studentStore.classes.push(studentClass)
    }
    student.classId = studentClass.id
  }
  if (studentClass) student.className = studentClass.name
}

const sql = neon(connectionString)
await sql`
  CREATE TABLE IF NOT EXISTS exam_portal_documents (
    document_key text PRIMARY KEY,
    payload jsonb NOT NULL,
    revision bigint NOT NULL DEFAULT 1,
    updated_at timestamptz NOT NULL DEFAULT now()
  )
`

async function importDocument(key, value, countLabel, count) {
  const inserted = await sql`
    INSERT INTO exam_portal_documents (document_key, payload)
    VALUES (${key}, ${JSON.stringify(value)}::jsonb)
    ON CONFLICT (document_key) DO NOTHING
    RETURNING document_key
  `
  if (inserted.length) console.log(`Imported ${count} ${countLabel}.`)
  else console.log(`Kept existing database ${key} data; local data was not copied over it.`)
}

await importDocument("exams", exams, "exam records", exams.length)
await importDocument("students", studentStore, "student accounts and classes", studentStore.students.length)
console.log("Data import complete. Existing local JSON files were left unchanged.")
