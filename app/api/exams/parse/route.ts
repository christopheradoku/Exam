import { NextRequest, NextResponse } from "next/server"
import { isTeacherRequest } from "../../../../server/auth"
import { parseRawExamText } from "../../../../server/groq"
import type { ObjectiveQuestion, TheoryPart } from "../../../../src/lib/examTypes"

function localParse(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const paper1: ObjectiveQuestion[] = []
  const paper2: TheoryPart[] = []
  let current: ObjectiveQuestion | null = null
  let theoryMode = false
  for (const line of lines) {
    if (/paper\s*2|theory|section\s*b/i.test(line)) theoryMode = true
    if (/paper\s*1|objectives|multiple.choice/i.test(line)) { theoryMode = false; continue }
    const optionMatch = line.match(/^([A-E])\s*[.)]\s*(.+)$/i)
    if (!theoryMode && optionMatch && current) {
      current.options.push({ id: `${current.id}-${optionMatch[1].toLowerCase()}`, label: optionMatch[1].toUpperCase(), text: optionMatch[2] })
      continue
    }
    const partMatch = line.match(/^(\d+)(\([a-z]\)(?:\([ivx]+\))*)\s*(.+)$/i)
    if (theoryMode && partMatch) {
      const marksMatch = partMatch[3].match(/\[(\d+)\s*marks?\]/i)
      const prompt = partMatch[3].replace(/\[\d+\s*marks?\]/i, "").trim()
      let parent = paper2.find((question) => question.label === partMatch[1])
      if (!parent) {
        parent = { id: `t${partMatch[1]}`, label: partMatch[1], prompt: `Question ${partMatch[1]}`, marks: 0, parts: [] }
        paper2.push(parent)
      }
      parent.parts ||= []
      parent.parts.push({ id: `t${partMatch[1]}${partMatch[2].replace(/[()]/g, "-")}`, label: partMatch[2], prompt, marks: Number(marksMatch?.[1] || 1) })
      parent.marks = (parent.parts || []).reduce((sum, part) => sum + part.marks, 0)
      continue
    }
    const questionMatch = line.match(/^(?:question\s*)?(\d+)\s*[.)]\s*(.+)$/i)
    if (questionMatch) {
      if (theoryMode) {
        const marksMatch = questionMatch[2].match(/\[(\d+)\s*marks?\]/i)
        paper2.push({ id: `t${questionMatch[1]}`, label: questionMatch[1], prompt: questionMatch[2].replace(/\[\d+\s*marks?\]/i, "").trim(), marks: Number(marksMatch?.[1] || 5) })
      } else {
        current = { id: `q${questionMatch[1]}`, stem: questionMatch[2], options: [] }
        paper1.push(current)
      }
    }
  }
  for (let i = paper1.length - 1; i >= 0; i--) if (paper1[i].options.length < 2) paper1.splice(i, 1)
  if (!paper1.length && !paper2.length) throw new Error("No questions found. Use numbered questions and A–E options, or configure GROQ_API_KEY for AI parsing.")
  return { paper1, paper2 }
}

export async function POST(request: NextRequest) {
  if (!isTeacherRequest(request)) return NextResponse.json({ error: "Sign in required." }, { status: 401 })
  const body = await request.json().catch(() => null) as { rawText?: string } | null
  if (!body?.rawText?.trim()) return NextResponse.json({ error: "Paste exam text to parse." }, { status: 400 })
  if (body.rawText.length > 100_000) return NextResponse.json({ error: "Exam text must be under 100,000 characters." }, { status: 413 })
  try {
    if (process.env.GROQ_API_KEY) return NextResponse.json({ ...(await parseRawExamText(body.rawText)), source: "groq" })
    return NextResponse.json({ ...localParse(body.rawText), source: "local" })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to parse the exam text." }, { status: 422 })
  }
}
