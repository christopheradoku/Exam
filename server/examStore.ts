import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"
import type { PortalExam } from "../src/lib/portalTypes"
import { readPortalDocument, updatePortalDocument } from "./portalDocumentStore"

const dataDir = path.join(process.cwd(), "data")
const dataFile = path.join(dataDir, "exams.json")
let writeChain: Promise<void> = Promise.resolve()

async function readLocalExams(): Promise<PortalExam[]> {
  try {
    return JSON.parse(await readFile(dataFile, "utf8")) as PortalExam[]
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
    throw error
  }
}

async function writeLocalExams(exams: PortalExam[]) {
  await mkdir(dataDir, { recursive: true })
  const temporary = `${dataFile}.${process.pid}.tmp`
  await writeFile(temporary, JSON.stringify(exams, null, 2), "utf8")
  await rename(temporary, dataFile)
}

async function updateLocalExams<T>(update: (exams: PortalExam[]) => T | Promise<T>) {
  const operation = writeChain.then(async () => {
    const exams = await readLocalExams()
    const result = await update(exams)
    await writeLocalExams(exams)
    return result
  })
  writeChain = operation.then(() => undefined, () => undefined)
  return operation
}

export async function listExams(): Promise<PortalExam[]> {
  return readPortalDocument("exams", [], readLocalExams)
}

export async function getExam(id: string): Promise<PortalExam | undefined> {
  return (await listExams()).find((exam) => exam.id === id)
}

export async function saveExam(exam: PortalExam): Promise<void> {
  await updatePortalDocument<PortalExam[], void>("exams", [], (exams) => {
    const index = exams.findIndex((item) => item.id === exam.id)
    if (index < 0) exams.push(exam)
    else exams[index] = exam
  }, () => updateLocalExams((exams) => {
    const index = exams.findIndex((item) => item.id === exam.id)
    if (index < 0) exams.push(exam)
    else exams[index] = exam
  }))
}

export async function replaceExams(exams: PortalExam[]): Promise<void> {
  await updatePortalDocument<PortalExam[], void>("exams", [], (stored) => {
    stored.length = 0
    for (const exam of exams) stored.push(exam)
  }, () => updateLocalExams((stored) => {
    stored.length = 0
    for (const exam of exams) stored.push(exam)
  }))
}
