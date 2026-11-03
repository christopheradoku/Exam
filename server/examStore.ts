import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"
import type { PortalExam } from "../src/lib/portalTypes"

const dataDir = path.join(process.cwd(), "data")
const dataFile = path.join(dataDir, "exams.json")
let writeChain: Promise<void> = Promise.resolve()

export async function listExams(): Promise<PortalExam[]> {
  try {
    return JSON.parse(await readFile(dataFile, "utf8")) as PortalExam[]
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
    throw error
  }
}

export async function getExam(id: string): Promise<PortalExam | undefined> {
  return (await listExams()).find((exam) => exam.id === id)
}

export async function saveExam(exam: PortalExam): Promise<void> {
  const operation = writeChain.then(async () => {
    const exams = await listExams()
    const index = exams.findIndex((item) => item.id === exam.id)
    if (index < 0) exams.push(exam)
    else exams[index] = exam
    await mkdir(dataDir, { recursive: true })
    const temporary = `${dataFile}.${process.pid}.tmp`
    await writeFile(temporary, JSON.stringify(exams, null, 2), "utf8")
    await rename(temporary, dataFile)
  })
  writeChain = operation.catch(() => {})
  await operation
}

export async function replaceExams(exams: PortalExam[]): Promise<void> {
  const operation = writeChain.then(async () => {
    await mkdir(dataDir, { recursive: true })
    const temporary = `${dataFile}.${process.pid}.tmp`
    await writeFile(temporary, JSON.stringify(exams, null, 2), "utf8")
    await rename(temporary, dataFile)
  })
  writeChain = operation.catch(() => {})
  await operation
}
